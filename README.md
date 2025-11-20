# 🏠 Home Server API — CSV Cleaning & AI QA Agent

Ez a projekt egy **NestJS alapú backend**, amely több kisebb „home-server” jellegű szolgáltatás alapját képezi.  
Első és jelenlegi fő funkciója egy **intelligens CSV tisztító és elemző API**, amely képes:

- a feltöltött CSV-t **kézi (deterministic)** módszerekkel megtisztítani,
- majd egy **AI ügynök segítségével** további strukturális hibákat keresni,
- és végül visszaadni a **megtisztított CSV-t**, valamint az AI által adott:
  - magyarázatot,
  - talált problémák listáját,
  - és javasolt tisztítási lépéseit.

A projekt célja egy olyan stabil, bővíthető backend kialakítása, amely később több különféle home-server jellegű funkciót is elláthat (pl. Angular frontend kiszolgálása, Cloudflare Tunnel mögötti szolgáltatások, adatfeldolgozás stb.).

---

## ✨ Funkcionalitás röviden

### 🔧 1. Determinisztikus CSV tisztítás (AI nélkül)
A rendszer saját tisztító motorral rendelkezik (`CsvEngineService`), amely képes:

- felesleges szóközök eltávolítására
- külső idézőjelek lecsupaszítására
- üres sorok eltávolítására
- hiányzó oszlopok kitöltésére vagy hibás sorok eldöntésére

Ezeket a lépéseket **minden CSV feltöltésnél automatikusan lefuttatjuk**.

---

### 🤖 2. AI-alapú ellenőrzés és hibadetektálás
A megtisztított CSV-ből a rendszer mintát készít, majd elküldi egy **kis erőforrásigényű LLM-nek** (alapértelmezetten *llama3.2:1b*).

Az AI feladata:

- strukturális anomáliák azonosítása (pl. hibás idézőjelek, eltérő oszlopszám),
- adattisztítási javaslatok adása egy fix action-készletből,
- emberi nyelven magyarázatot fűzni a talált hibákhoz.

A rendszer **csak JSON választ fogad el**, és a hibás, mellébeszélős kimeneteket automatikusan szűri.

---

### 🧹 3. Tisztítási lépések összevonása
A rendszer az AI által javasolt action-öket **tényleges tisztító műveletekké alakítja**, és a teljes CSV-re alkalmazza.

A válasz részei:

- `cleanedCsv` — a végleges tisztított CSV
- `stats` — hany sor változott, hány lett törölve, hány oszlop lett egységesítve
- `aiReview` — az AI magyarázata és akciólistája

---

## 🚀 Használat (lokális fejlesztés)

## 📡 API rövid dokumentáció

### POST `/api/csv/clean`

**Kérés:**
{
  "csv": "ID,Name,Age\n1,John,25\n2,Anna,30",
  "delimiter": ",",
  "hasHeader": true
}
**Válasz:**
{
  "aiReview": {
    "explanation": "...",
    "issues": [],
    "actions": []
  },
  "stats": {
    "rowsBefore": 3,
    "rowsAfter": 3,
    "columns": 3,
    "rowsChanged": 1,
    "rowsDropped": 0
  },
  "cleanedCsv": "..."
}

## 🛠 Tech stack

- **NestJS** — keretrendszer
- **TypeScript**
- **Axios** — AI agent hívásához
- **Ollama / OpenAI-kompatibilis API** — LLM integráció
- **CSV Engine (custom)** — saját, bővíthető tisztító modul
- **GitHub Actions (később)** — CI/CD alapok előkészítve

---

## 📘 Példa workflow

1. A felhasználó feltölt egy problémás CSV-t  
2. A backend elemzi és determinisztikusan megtisztítja  
3. A backend mintát készít és elküldi az AI-nak  
4. Az AI JSON-ban visszaküld magyarázatot, problémalistát, javasolt actionöket  
5. A backend ezeket valós tisztító lépésekké alakítja  
6. A végleges CSV visszakerül a frontendnek  

---

## 📦 Jövőbeli tervek

A projekt modulárisan bővíthető. A tervezett funkciók:

### 🔹 1. Frontend (Angular + Ionic)
- CSV feltöltő UI  
- “Előtte / utána” megjelenítés  
- Tokenhasználat megjelenítése  
- Letisztult demófelület  

### 🔹 2. Erősebb AI modellek támogatása
- GPT-4o / GPT-4o-mini  
- Mistral 7B / 8x22B  
- DeepSeek R1  

### 🔹 3. CSV Engine bővítése
- Robosztusabb CSV parser  
- Nagy fájlok stream-alapú feldolgozása  
- Validátor modulok (email, dátum, szám)  

### 🔹 4. Home-server modulok
- File manager  
- Reverse proxy helper  
- Logoló szolgáltatás  
- Angular alkalmazások hostolása  



<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
