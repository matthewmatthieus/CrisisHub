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

2. Create a MySQL database named `crisishub`.

3. Import the database files in this order:

```bash
mysql -u root -p crisishub < database/schema.sql
mysql -u root -p crisishub < database/seed.sql
```

4. Copy `.env.example` to `.env` and update the database credentials.

5. Start the app:

```bash
npm start
```

6. Open `http://localhost:3000` and click `Demo Login` to test the Member 3 feature until the real authentication module is connected.
