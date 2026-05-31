const { Client } = require('pg');

async function setupDatabase() {
  const client = new Client({
    user: 'postgres',
    host: 'localhost',
    database: 'postgres',
    password: 'postgres',
    port: 5432,
  });

  try {
    await client.connect();
    console.log('Connected to PostgreSQL as postgres user');

    // Create database
    try {
      await client.query('CREATE DATABASE dta_db');
      console.log('Database dta_db created successfully');
    } catch (err) {
      if (err.code === '42P04') {
        console.log('Database dta_db already exists');
      } else {
        console.error('Error creating database:', err);
      }
    }

    // Create user
    try {
      await client.query("CREATE USER dta WITH PASSWORD 'dta_secret'");
      console.log('User dta created successfully');
    } catch (err) {
      if (err.code === '42710') {
        console.log('User dta already exists');
        // Update password
        await client.query("ALTER USER dta WITH PASSWORD 'dta_secret'");
        console.log('User dta password updated');
      } else {
        console.error('Error creating user:', err);
      }
    }

    await client.end();
  } catch (err) {
    console.error('Connection error:', err);
    return;
  }

  // Connect to the dta_db database to grant permissions
  const client2 = new Client({
    user: 'postgres',
    host: 'localhost',
    database: 'dta_db',
    password: 'postgres',
    port: 5432,
  });

  try {
    await client2.connect();
    console.log('Connected to dta_db as postgres user');

    // Grant necessary permissions
    try {
      await client2.query('GRANT ALL PRIVILEGES ON SCHEMA public TO dta');
      console.log('Schema privileges granted to user dta');
    } catch (err) {
      console.error('Error granting schema privileges:', err);
    }

    try {
      await client2.query('GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO dta');
      console.log('Table privileges granted to user dta');
    } catch (err) {
      console.error('Error granting table privileges:', err);
    }

    try {
      await client2.query('GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO dta');
      console.log('Sequence privileges granted to user dta');
    } catch (err) {
      console.error('Error granting sequence privileges:', err);
    }

    try {
      await client2.query('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO dta');
      console.log('Default table privileges granted to user dta');
    } catch (err) {
      console.error('Error granting default table privileges:', err);
    }

    try {
      await client2.query('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO dta');
      console.log('Default sequence privileges granted to user dta');
    } catch (err) {
      console.error('Error granting default sequence privileges:', err);
    }

    await client2.end();
  } catch (err) {
    console.error('Connection error to dta_db:', err);
  }
}

setupDatabase();