import { Injectable } from '@nestjs/common';

/**
 * Belső típusok a tisztító lépésekhez.
 * Ezekre a cleaning action-ökre fordítjuk az AI által adott action listát.
 */

type CleaningMode = 'drop-row' | 'pad-with-empty';
type CoerceOnError = 'drop-row' | 'set-null' | 'set-zero';

interface CleaningActionBase {
  type: string;
}

interface TrimWhitespaceAction extends CleaningActionBase {
  type: 'TRIM_WHITESPACE';
}

interface StripWrappingQuotesAction extends CleaningActionBase {
  type: 'STRIP_WRAPPING_QUOTES';
}

interface EnsureEqualColumnsAction extends CleaningActionBase {
  type: 'ENSURE_EQUAL_COLUMNS';
  mode: CleaningMode;
}

interface RemoveEmptyRowsAction extends CleaningActionBase {
  type: 'REMOVE_EMPTY_ROWS';
}

interface CoerceNumericAction extends CleaningActionBase {
  type: 'COERCE_NUMERIC';
  columnIndex: number;
  onError: CoerceOnError;
}

/**
 * A Nest által ténylegesen végrehajtott tisztító lépések típusa.
 */
export type CleaningAction =
  | TrimWhitespaceAction
  | StripWrappingQuotesAction
  | EnsureEqualColumnsAction
  | RemoveEmptyRowsAction
  | CoerceNumericAction;

export interface ApplyActionsResult {
  rows: string[][];
  rowsChanged: number;
  rowsDropped: number;
}

/**
 * CsvEngineService:
 * - NINCS benne AI logika
 * - csak "bután" dolgozik: parseol, szerializál, action-öket alkalmaz
 *
 * Így később könnyen cserélhető CSV-lib, bővíthető az action készlet,
 * anélkül hogy az AI/Nest hívásokhoz hozzá kellene nyúlni.
 */
@Injectable()
export class CsvEngineService {
  /**
   * Egyszerű "sample builder": az első maxLines sort adja vissza.
   * Ezt a mintát küldjük el az AI-nak elemzésre.
   */
  buildSample(csv: string, maxLines = 50): string {
    const lines = csv.split(/\r?\n/);
    const sliced = lines.slice(0, maxLines);
    return sliced.join('\n');
  }

  /**
   * Nagyon egyszerű CSV "parser".
   * - sorokra vág \r?\n alapján
   * - üres sorokat eldob
   * - delimiter mentén splitel
   *
   * Később lecserélhető egy komolyabb CSV-lib-re.
   */
  parseCsv(csv: string, delimiter: string): string[][] {
    const lines = csv.split(/\r?\n/).filter((line) => line.length > 0);
    return lines.map((line) => line.split(delimiter));
  }

  /**
   * A belső string[][] reprezentációból újra CSV szöveget készít.
   */
  serializeCsv(rows: string[][], delimiter: string): string {
    return rows.map((row) => row.join(delimiter)).join('\n');
  }

  /**
   * Helper: AI által adott nyers action-ökből (unknown[])
   * típusos CleaningAction-öket csinálunk.
   *
   * Ismeretlen action típusokat csendben ignorálunk.
   */
  mapToCleaningActions(rawActions: unknown[]): CleaningAction[] {
    const actions: CleaningAction[] = [];

    for (const a of rawActions) {
      const obj = a as {
        type?: unknown;
        mode?: unknown;
        onError?: unknown;
        columnIndex?: unknown;
      };

      if (typeof obj.type !== 'string') {
        continue;
      }

      switch (obj.type) {
        case 'TRIM_WHITESPACE':
          actions.push({ type: 'TRIM_WHITESPACE' });
          break;

        case 'STRIP_WRAPPING_QUOTES':
          actions.push({ type: 'STRIP_WRAPPING_QUOTES' });
          break;

        case 'ENSURE_EQUAL_COLUMNS': {
          const mode: CleaningMode =
            obj.mode === 'pad-with-empty' ? 'pad-with-empty' : 'drop-row';
          actions.push({
            type: 'ENSURE_EQUAL_COLUMNS',
            mode,
          });
          break;
        }

        case 'REMOVE_EMPTY_ROWS':
          actions.push({ type: 'REMOVE_EMPTY_ROWS' });
          break;

        case 'COERCE_NUMERIC': {
          if (typeof obj.columnIndex === 'number') {
            const rawOnError = obj.onError;
            const onError: CoerceOnError =
              rawOnError === 'set-null' ||
              rawOnError === 'set-zero' ||
              rawOnError === 'drop-row'
                ? rawOnError
                : 'drop-row';

            actions.push({
              type: 'COERCE_NUMERIC',
              columnIndex: obj.columnIndex,
              onError,
            });
          }
          break;
        }

        default:
          // ismeretlen action típust kihagyjuk
          break;
      }
    }

    return actions;
  }

  /**
   * A CleaningAction listát sorrendben végrehajtja a teljes CSV-n.
   * Visszaadja az új rows-t és egyszerű statisztikákat.
   */
  applyActions(
    rows: string[][],
    actions: CleaningAction[],
    hasHeader: boolean,
  ): ApplyActionsResult {
    let workingRows = rows;
    let rowsChanged = 0;
    let rowsDropped = 0;

    for (const action of actions) {
      switch (action.type) {
        case 'TRIM_WHITESPACE': {
          let changedHere = 0;
          workingRows = workingRows.map((row) => {
            const newRow = row.map((cell) => {
              const trimmed = cell.trim();
              if (trimmed !== cell) {
                changedHere++;
              }
              return trimmed;
            });
            return newRow;
          });
          rowsChanged += changedHere;
          break;
        }

        case 'STRIP_WRAPPING_QUOTES': {
          let changedHere = 0;
          workingRows = workingRows.map((row) => {
            const newRow = row.map((cell) => {
              const trimmed = cell.trim();
              if (
                trimmed.length >= 2 &&
                trimmed.startsWith('"') &&
                trimmed.endsWith('"')
              ) {
                const inner = trimmed.slice(1, -1);
                // egyszerű eset: levágjuk a külső idézőket
                changedHere++;
                return inner;
              }
              return cell;
            });
            return newRow;
          });
          rowsChanged += changedHere;
          break;
        }

        case 'ENSURE_EQUAL_COLUMNS': {
          const expectedColumns =
            workingRows.length > 0 ? workingRows[0].length : 0;
          const newRows: string[][] = [];
          for (const row of workingRows) {
            if (row.length === expectedColumns) {
              newRows.push(row);
              continue;
            }

            if (
              action.mode === 'pad-with-empty' &&
              row.length < expectedColumns
            ) {
              const padded = [...row];
              while (padded.length < expectedColumns) {
                padded.push('');
              }
              rowsChanged++;
              newRows.push(padded);
            } else if (action.mode === 'drop-row') {
              rowsDropped++;
              // nem tesszük be a newRows-ba
            } else {
              // biztonsági fallback: extra oszlopokat levágunk
              const sliced = row.slice(0, expectedColumns);
              rowsChanged++;
              newRows.push(sliced);
            }
          }
          workingRows = newRows;
          break;
        }

        case 'REMOVE_EMPTY_ROWS': {
          const newRows: string[][] = [];

          for (let rowIndex = 0; rowIndex < workingRows.length; rowIndex++) {
            const row = workingRows[rowIndex];

            // Header sort SOHA ne dobjuk
            if (hasHeader && rowIndex === 0) {
              newRows.push(row);
              continue;
            }

            // Döntés: csak az ID utáni cellákat nézzük, ha van ID oszlop.
            // Egyszerű szabály: ha az első oszlopban ID van, de MINDEN MÁS oszlop üres/whitespace,
            // akkor a sor "üres adat sor"-nak minősül.
            const startCol = row.length > 1 ? 1 : 0;
            const cellsToCheck = row.slice(startCol);

            const allEmpty = cellsToCheck.every(
              (cell) => cell.trim().length === 0,
            );

            if (allEmpty) {
              rowsDropped++;
              continue; // nem tesszük be a newRows-ba
            }

            newRows.push(row);
          }

          workingRows = newRows;
          break;
        }

        case 'COERCE_NUMERIC': {
          const startIndex = hasHeader ? 1 : 0;
          const newRows = [...workingRows];

          for (let i = startIndex; i < newRows.length; i++) {
            const row = newRows[i];
            if (action.columnIndex < 0 || action.columnIndex >= row.length) {
              continue;
            }
            const value = row[action.columnIndex];
            const trimmed = value.trim();
            if (trimmed.length === 0) {
              continue;
            }
            const num = Number(trimmed);
            if (Number.isNaN(num)) {
              if (action.onError === 'drop-row') {
                newRows.splice(i, 1);
                rowsDropped++;
                i--; // mert rövidebb lett a tömb
                continue;
              }
              if (action.onError === 'set-null') {
                row[action.columnIndex] = '';
                rowsChanged++;
              } else if (action.onError === 'set-zero') {
                row[action.columnIndex] = '0';
                rowsChanged++;
              }
            } else if (String(num) !== value) {
              row[action.columnIndex] = String(num);
              rowsChanged++;
            }
          }

          workingRows = newRows;
          break;
        }

        default:
          break;
      }
    }

    return { rows: workingRows, rowsChanged, rowsDropped };
  }
}
