# Influencer Outreach Engine (MVP)

This is a minimal working prototype of an Influencer Outreach Engine. It allows brands to connect sandboxed SMTP accounts, upload or manually edit lists of target influencers, personalize outreach templates, and review delivery logs.

For a detailed write-up of architecture choices, shortcuts, and scaling strategies, see [TRADEOFFS.md](file:///wsl.localhost/Ubuntu-24.04/home/paul/projects/MetricTreeLab-TakeHomeTest/TRADEOFFS.md).

---

## Method 1: Running with Docker (Recommended)

This is the fastest method. It spins up the Next.js application, a PostgreSQL database, and a local Mailpit SMTP server in containerized sandboxes with one command.

### Prerequisites
- Docker and Docker Compose installed on your system.

### Steps
1. Navigate to the project root directory.
2. Run the following command:
   ```bash
   docker compose up --build
   ```
3. Once build and migrations complete:
   - **Application Web UI**: Access at [http://localhost:3000](http://localhost:3000).
   - **Mailpit Web Client (captured emails)**: Access at [http://localhost:8025](http://localhost:8025).

---

## Method 2: Running Locally (Manual Setup)

Use this method if you prefer to run the database and node services directly on your host machine.

### Prerequisites
- Node.js (v18 or higher) and npm installed.
- A running PostgreSQL instance.
- Mailpit installed locally (or run just the mail service via: `docker run -d -p 1025:1025 -p 8025:8025 axllent/mailpit`).

### Steps
1. **Configure Environment Variables**:
   Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
   Open the `.env` file and update `DATABASE_URL` with your local PostgreSQL credentials.

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Database Migration**:
   Sync your database schema using Prisma:
   ```bash
   npx prisma generate
   npx prisma db push
   ```

4. **Start the Development Server**:
   ```bash
   npm run dev
   ```
5. Open the services:
   - **Application Web UI**: [http://localhost:3000](http://localhost:3000).
   - **Mailpit Web Client**: [http://localhost:8025](http://localhost:8025).

---

## Testing the Sending Flow

1. Open the Web UI at [http://localhost:3000](http://localhost:3000).
2. Configure your outreach templates on the left panel (you can use bracket variables like `{{Name}}` or `{{Followers}}`).
3. Import your list via the **Upload CSV / XLSX** button, or manually add rows with the **Add Row** button in the spreadsheet.
4. Select a sending mode:
   - **Sequential**: Sends emails one by one with a 500ms delay.
   - **Burst**: Sends all emails simultaneously using parallel connections.
5. Click **Start Outreach Campaign**.
6. Check [http://localhost:8025](http://localhost:8025) in your browser to view all captured outbound emails.
7. Scroll down to review the persistent database entry list under **Email History Log** on the application dashboard.


**Video Reference**:https://drive.google.com/file/d/1dRr2HaGRetdzRvlQPwOQP3eK8Ni9YxGS/view?usp=sharing
