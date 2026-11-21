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

### Messaging between matches

Matched users can send each other text messages from the **Messages** tab.
The tables (`sessions`, `matches`, `messages`) are in `db/messaging.sql`. The server
creates them automatically when it starts, so existing databases don't need a reset.

The matching feature isn't built yet, so make a test match by hand:

1. With `npm run dev` running, sign up two accounts in the app (for example in a normal
   window and a private window).
2. Match them:
   ```
   npm run match -- first@example.com second@example.com
   ```
3. Open **Messages** in both windows and chat. New messages show up within about 2 seconds.

Add `--unmatch` to the end of step 2 to delete the match and its messages.

**For the matching feature:** when two users match, call
`store.createMatch(userIdA, userIdB)` (in `roommate-finder/server/store.js`). That's all
messaging needs; the conversation appears in both users' Messages tab. To open a chat
from a match card, render `<Messages user={user} initialMatchId={matchId} ... />`.

**Tests:**

| Command | What it checks |
| --- | --- |
| `npm test` | Messaging rules (login required, only the two matched users can read/send, input checks). No database needed. |
| `npm run test:e2e` | A full conversation through the real server and database. Run `npm run db:up` and `npm run dev` first. It deletes the accounts it creates. |

### Moving old accounts out of `users.txt`

Accounts used to be saved in `roommate-finder/server/users.txt`. To copy them into the
database once (passwords keep working):

```
npm run db:up
npm run migrate --prefix roommate-finder
```

After that, `users.txt` isn't used anymore and can be deleted.
