# CrisisHub

CrisisHub is a Node.js, Express, EJS, and MySQL web application for community crisis reporting and emergency resource coordination.

## Member 3 Feature

Hariharan Thiagarajan `25003620` owns the Resource Offers & Intelligent Matching feature.

Implemented routes:

- `GET /resourceOffers`
- `GET /resourceOffers/new`
- `POST /resourceOffers`
- `GET /resourceOffers/:id`
- `GET /resourceOffers/:id/edit`
- `POST /resourceOffers/:id/update`
- `POST /resourceOffers/:id/delete`
- `POST /matches/:id/accept`
- `POST /matches/:id/reject`

The feature stores resource offers in MySQL, compares them with open help requests, saves suitable matches, and starts fulfillment tracking when a match is accepted.

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create or connect to the shared MySQL database named `c237_017_team2_crisishub`.

3. Import the database files in this order:

```bash
mysql -u root -p c237_017_team2_crisishub < database/schema.sql
mysql -u root -p c237_017_team2_crisishub < database/seed.sql
```

4. Copy `.env.example` to `.env` and update the database credentials. Keep `DB_SSL=true` for the shared database.

5. Start the app:

```bash
npm start
```

6. Open `http://localhost:3000` and sign in with a verified CrisisHub account.

## Deployment

The app is ready for a single-instance Render deployment using the included `render.yaml` blueprint.

Set these environment variables in the hosting provider:

- `NODE_ENV=production`
- `PORT` is supplied by Render
- `APP_URL` to the deployed HTTPS URL
- `SESSION_SECRET` to a long random value
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, and `DB_SSL=true`
- `RESEND_API_KEY` and `EMAIL_FROM` using a verified Resend domain

The health check is available at `/health`. Do not commit `.env` or provider credentials. File uploads use the local filesystem, so configure persistent storage or move uploads to object storage before using multiple instances.
