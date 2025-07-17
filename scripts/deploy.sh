#!/bin/bash
echo "Starting deployment..."

# Install dependencies
npm install
pip install -r requirements.txt

# Run tests
npm test

# Setup database
psql -U $DB_USER -d $DB_NAME -f scripts/setup-database.sql

# Start application
npm start

echo "Deployment complete!"