# Setup Guide

# Setup Python and Backend Server
You'll need to be sure that your machine has all the tools needed to install and run code for the project:
1. Install NPM. `sudo apt install npm`.
2. Install all the project dependencies. `npm install`.
3. Install python3 and related essentials. 
`sudo apt install python3`
`sudo apt install python3.12-venv`
`sudo apt install python3-dev build-essential`
5. Create a virtual python environment. `python3 -m venv venv`
6. Activate the virtual python environment. `source venv/bin/activate`
7. Download and install all required packages. `pip3 install -r requirements.txt`

# Setup your Database
This guide walks through setting up the PostgreSQL database for the AI Game Hub project.

## Prerequisites

Ensure PostgreSQL is installed and running on your system:
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

## Database Setup Steps

### 1. Create the Database and User

Connect to PostgreSQL as the postgres superuser:
```bash
sudo -u postgres psql
```

Inside the psql prompt, run the following commands. 

NOTE: replace `user` with whatever username you want, and update `your_password_here`, too. You'll need them later:

```sql
CREATE DATABASE game_ai_db;
CREATE USER user WITH PASSWORD 'your_password_here';
GRANT ALL PRIVILEGES ON DATABASE game_ai_db TO user;
\q
```

### 2. Grant Schema Permissions

Connect to the database as the postgres superuser:
```bash
sudo -u postgres psql -d game_ai_db
```

Grant the necessary permissions on the public schema.

NOTE: You'll need to set your own username here in place of `user`!

```sql
GRANT ALL ON SCHEMA public TO user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO user;
\q
```

### 3. Run the Setup Script

From the project root directory, execute the database setup script.

NOTE: Again, update `user` to your selected username:

```bash
psql -U user -d game_ai_db -f scripts/setup-database.sql
```

You'll be prompted for the password you set in step 1.

# Create or Update your ENV
In order to keep any private information secure, we store all private information to a .env file. This file is ignored by github and will therefore never be shared with anyone.

1. In the root folder, where the .env.example file exists, create a new file named `.env`. Copy the contents from the `.env.example` into it.
2. Update the data in this file to match your credentials from earlier in this setup. This includes:
   * Your psql username and password. Yes, your password will be literally written out in a file - this is why we don't share it!
   * Your proxy domain, if applicable. For local development (when your URL is `localhost:8000`, for instance), leave this blank.
   * Your own credentials for google auth, if you want to test with it. You'll need to configure this in https://console.cloud.google.com.

# Run the Website

You can use the scripts in package.json to run the website. In order to run the full website, including the python server (with connection to psql) along with the front-end and tailwindcss for styling, simply run
`npm run dev:all`

You can run other scripts as need, and may need to adjust them for your local machine, as many use relative paths during execution.
