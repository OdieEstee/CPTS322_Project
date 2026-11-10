# CPTS322_Project
The semester project made for CPTS 322 at WSU

## Running the app

Accounts and roommate details are stored in a PostgreSQL database that runs in Docker,
so you don't need to install PostgreSQL yourself.

### First-time setup

1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) and start it.
2. From this folder, create your settings file:
   ```
   cp .env.example .env
   ```
3. Install packages (this folder, then the app folder):
   ```
   npm install
   npm install --prefix roommate-finder
   ```

### Every time you work on the app

```
npm run db:up    # start the database (it keeps running in the background)
npm run dev      # start the React frontend and Express backend
```

Check that the backend can reach the database: http://localhost:3001/api/health

### Useful database commands

| Command | What it does |
| --- | --- |
| `npm run db:up` | Start the database |
| `npm run db:down` | Stop the database (data is kept) |
| `npm run db:reset` | **Delete all data** and rebuild the tables from `db/init.sql` |
| `docker exec -it roommate_db psql -U roommate_user -d roommate_finder` | Open a SQL prompt inside the database |

The tables are defined in `db/init.sql`. If you change that file, run `npm run db:reset`
so it runs again.

### Moving old accounts out of `users.txt`

Accounts used to be saved in `roommate-finder/server/users.txt`. To copy them into the
database once (passwords keep working):

```
npm run db:up
npm run migrate --prefix roommate-finder
```

After that, `users.txt` isn't used anymore and can be deleted.
