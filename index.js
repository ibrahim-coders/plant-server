const express = require('express');
const app = express();
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();
const { MongoClient, timestamp, ObjectId } = require('mongodb');
const morgan = require('morgan');
const port = process.env.PORT || 5000;
const jwt = require('jsonwebtoken');
// Middleware
const corsOptions = {
  origin: ['http://localhost:5173', 'http://localhost:5174'],
  credentials: true,
  optionSuccessStatus: 200,
};
app.use(cors(corsOptions));

app.use(express.json());
app.use(cookieParser());
app.use(morgan('dev'));

const verifyToken = async (req, res, next) => {
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).send({ message: 'unauthorized access' });
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      console.log(err);
      return res.status(401).send({ message: 'unauthorized access' });
    }
    req.user = decoded;
    next();
  });
};
// MongoDB URI
const uri = `mongodb://${process.env.NAME_USER}:${process.env.USER_PASS}@cluster0-shard-00-00.whh17.mongodb.net:27017,cluster0-shard-00-01.whh17.mongodb.net:27017,cluster0-shard-00-02.whh17.mongodb.net:27017/?ssl=true&replicaSet=atlas-7nculf-shard-0&authSource=admin&retryWrites=true&w=majority&appName=Cluster0`;
MongoClient.connect(uri, { useUnifiedTopology: true }).then(client => {
  const db = client.db('plantNet');
  let userCollection = db.collection('users');

  let plantsCollection = db.collection('plants');

  // Generate jwt token
  app.post('/jwt', async (req, res) => {
    const email = req.body;
    const token = jwt.sign(email, process.env.ACCESS_TOKEN_SECRET, {
      expiresIn: '365d',
    });
    res
      .cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
      })
      .send({ success: true });
  });
  // Logout
  app.get('/logout', async (req, res) => {
    try {
      res
        .clearCookie('token', {
          maxAge: 0,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        })
        .send({ success: true });
    } catch (err) {
      res.status(500).send(err);
    }
  });

  // POST: Add a new item to the collection
  app.post('/users/:email', async (req, res) => {
    const email = req.params.email;
    const query = { email };
    const user = req.body;
    const isExist = await userCollection.findOne(query);
    if (isExist) {
      return res.send(isExist);
    }
    const result = await userCollection.insertOne({
      ...user,
      role: 'Customer',
      timestamp: Date.now(),
    });
    res.send(result);
  });
  //post the plants data
  app.get('/plants', async (req, res) => {
    const result = await plantsCollection.find().toArray();
    res.send(result);
  });

  app.post('/plants', verifyToken, async (req, res) => {
    const plants = req.body;
    const result = await plantsCollection.insertOne(plants);
    res.send(result);
  });

  //detelais plants
  app.get('/plants/:id', async (req, res) => {
    const id = req.params.id;
    const query = { _id: new ObjectId(id) };
    const result = await plantsCollection.findOne(query);
    res.send(result);
  });
  // Default route
  app.get('/', (req, res) => {
    res.send('Hello World!');
  });

  // Start the server after MongoDB connection is ready
  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
});
