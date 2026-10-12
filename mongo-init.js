// MongoDB initialization script
// This runs when MongoDB container is first created

db = db.getSiblingDB('live_translator');

// Create app-specific user with limited privileges
db.createUser({
  user: process.env.MONGO_APP_USER || 'translator_app',
  pwd: process.env.MONGO_APP_PASS || 'CHANGE_THIS_IN_PRODUCTION',
  roles: [
    { role: 'readWrite', db: 'live_translator' }
  ]
});

// Create collections with schema validation
db.createCollection('users', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['email', 'passwordHash', 'role'],
      properties: {
        email: { bsonType: 'string', pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$' },
        passwordHash: { bsonType: 'string' },
        role: { bsonType: 'string', enum: ['user', 'admin'] },
        isActive: { bsonType: 'bool' }
      }
    }
  }
});

db.createCollection('translationhistories', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['userId', 'sourceText', 'translatedText'],
      properties: {
        userId: { bsonType: 'objectId' },
        sourceText: { bsonType: 'string', maxLength: 5000 },
        translatedText: { bsonType: 'string', maxLength: 10000 },
        sourceLang: { bsonType: 'string' },
        targetLang: { bsonType: 'string' }
      }
    }
  }
});

// Create indexes
db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ createdAt: 1 });
db.translationhistories.createIndex({ userId: 1, createdAt: -1 });
db.translationhistories.createIndex({ createdAt: 1 }, { expireAfterSeconds: 7776000 }); // 90 days TTL

print('MongoDB initialization complete.');
