const { Client } = require('pg');

async function testConnection() {
  const client = new Client({
    user: 'dta',
    host: 'localhost',
    database: 'dta_db',
    password: 'dta_secret',
    port: 5432,
  });

  try {
    await client.connect();
    console.log('Connected successfully!');
    await client.end();
  } catch (err) {
    console.error('Connection error:', err);
  }
}

testConnection();