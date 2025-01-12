const express = require('express');
const app = express();
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();
const { MongoClient, timestamp, ObjectId } = require('mongodb');
const morgan = require('morgan');
const port = process.env.PORT || 5000;
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
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

//nodemiler
const sendEmail = (emailAddress, emailData) => {
  // const emailData = {
  //   subject: 'This is a very important subject',
  //   message: 'Nice Message',
  // };
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // true for port 465, false for other ports
    auth: {
      user: process.env.NODEMILER_USER,
      pass: process.env.NODEMILAR_PASS,
    },
  });
  transporter.verify((error, success) => {
    if (error) {
      console.log(error);
    } else {
      console.log('Transporter is ready to email', success);
    }
  });
  const mailBody = {
    from: '"Maddison Foo Koch 👻" <maddison53@ethereal.email>',
    to: emailAddress,
    subject: emailData?.subject, // Subject line
    text: emailData?.message, // plain text body
    html: `<p>${emailData?.message}</p>`, // html body
  };
  transporter.sendMail(mailBody, (error, info) => {
    if (error) {
      console.log(error);
    } else {
      console.log('Email send:', info?.response);
    }
  });
};
// MongoDB URI
const uri = `mongodb://${process.env.NAME_USER}:${process.env.USER_PASS}@cluster0-shard-00-00.whh17.mongodb.net:27017,cluster0-shard-00-01.whh17.mongodb.net:27017,cluster0-shard-00-02.whh17.mongodb.net:27017/?ssl=true&replicaSet=atlas-7nculf-shard-0&authSource=admin&retryWrites=true&w=majority&appName=Cluster0`;
MongoClient.connect(uri, { useUnifiedTopology: true }).then(client => {
  const db = client.db('plantNet');
  let userCollection = db.collection('users');

  let plantsCollection = db.collection('plants');
  let ordersCollection = db.collection('orders');

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

  const verifyAdmin = async (req, res, next) => {
    console.log('data from verifyToken middleware', req.user);
    const email = req.user?.email;
    const query = { email };
    const result = await userCollection.findOne(query);
    if (!result || result?.role !== 'admin') {
      return res
        .status(403)
        .send({ message: 'Forvidden access! Admins only.' });
    }
    next();
  };
  const verifySeller = async (req, res, next) => {
    console.log('data from verifyToken middleware', req.user);
    const email = req.user?.email;
    const query = { email };
    const result = await userCollection.findOne(query);
    if (!result || result?.role !== 'seller') {
      return res
        .status(403)
        .send({ message: 'Forvidden access! Admins only.' });
    }
    next();
  };

  //manage user  status and role
  app.patch('/users/:email', async (req, res) => {
    const email = req.params.email;
    const query = { email };
    const user = await userCollection.findOne(query);
    if (!user || user.status === 'Requested') {
      return res
        .status?.(400)
        .send('you have a already requested, wait for some time!');
    }
    const updateDoc = {
      $set: {
        status: 'Requested',
      },
    };
    const result = await userCollection.updateOne(query, updateDoc);
    res.send(result);
  });

  //get user role
  app.get('/users/role/:email', async (req, res) => {
    const email = req.params.email;
    const result = await userCollection.findOne({ email: email });
    // res.send({ role: result?.role });

    if (result) {
      res.send({ role: result.role });
    } else {
      res.status(404).send({ message: 'User not found' });
    }
  });
  // get all user data
  app.get('/all-user/:email', verifyToken, verifyAdmin, async (req, res) => {
    const email = req.params.email;
    const query = { email: { $ne: email } };
    const result = await userCollection.find(query).toArray();
    res.send(result);
  });

  //user update role
  app.patch('/user/role/:email', verifyToken, async (req, res) => {
    const email = req.params.email;
    const { role } = req.body;
    const filter = { email };
    const updateDoc = {
      $set: { role, status: 'Verified' },
    };
    const result = await userCollection.updateOne(filter, updateDoc);
    res.send(result);
  });
  // POST: Add a new item to the collection
  app.post('/users/:email', async (req, res) => {
    // sendEmail();
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
  //all seller plants
  app.get('/plants/seller', verifyToken, verifySeller, async (req, res) => {
    const email = req.user.email;
    const result = await plantsCollection
      .find({ 'seller.email': email })
      .toArray();
    res.send(result);
  });
  //plent delete
  app.delete('/plants/:id', verifyToken, verifySeller, async (req, res) => {
    const id = req.params.id;
    const query = { _id: new ObjectId(id) };
    const result = await plantsCollection.deleteOne(query);
    res.send(result);
  });
  app.post('/plants', verifyToken, verifySeller, async (req, res) => {
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
  //save the order data
  app.post('/order', verifyToken, async (req, res) => {
    const orderInfo = req.body;
    const result = await ordersCollection.insertOne(orderInfo);
    //send email
    // if (result?.insertedId) {
    //   // Sending email to customer after successful order
    //   sendEmail(orderInfo?.customer?.email, {
    //     subject: 'Order Successfully Placed',
    //     text: `You've placed an order successfully. Transaction ID: ${result?.insertedId}`,
    //     html: `<p>You've placed an order successfully. <strong>Transaction ID:</strong> ${result?.insertedId}</p>`,
    //   });

    //   // Sending email to seller after successful order
    //   sendEmail(orderInfo?.seller?.email, {
    //     subject: 'New Order Received',
    //     text: `A new order has been placed successfully. Transaction ID: ${result?.insertedId}`,
    //     html: `<p>A new order has been placed successfully. <strong>Transaction ID:</strong> ${result?.insertedId}</p>`,
    //   });
    // }

    res.send(result);
  });
  //order statuse update
  app.patch(
    '/orders-status/:id',
    verifyToken,

    async (req, res) => {
      const id = req.params.id;
      const { status } = req.body;
      console.log('order changes', status);
      const filter = { id: new ObjectId(id) };
      const updateDoc = {
        $set: { status },
      };
      const result = await ordersCollection.updateOne(filter, updateDoc);
      res.send(result);
    }
  );
  //manage the quantity of the plants
  app.patch('/plants/quantity/:id', verifyToken, async (req, res) => {
    const id = req.params.id;
    const { quantityToUpdate, status } = req.body;
    const filter = { _id: new ObjectId(id) };
    let updateDoc = {
      $inc: {
        quantity: -quantityToUpdate,
      },
    };
    if (status === 'increase') {
      updateDoc = {
        $inc: {
          quantity: quantityToUpdate,
        },
      };
    }
    const result = await plantsCollection.updateOne(filter, updateDoc);
    res.send(result);
  });
  //get all orders for a specific customer
  app.get('/orders/customers/:email', verifyToken, async (req, res) => {
    const email = req.params.email;
    const query = { 'customer.email': email };

    try {
      const result = await ordersCollection
        .aggregate([
          {
            $match: query,
          },
          {
            $addFields: {
              plantId: { $toObjectId: '$plantId' },
            },
          },
          {
            $lookup: {
              from: 'plants',
              localField: 'plantId',
              foreignField: '_id',
              as: 'plants',
            },
          },
          {
            $unwind: '$plants',
          },
          {
            $addFields: {
              name: '$plants.name',
              image: '$plants.image',
              category: '$plants.category',
            },
          },
          {
            $project: {
              // price: 1,
              // name: 1,
              plants: 0,
            },
          },
        ])
        .toArray();

      res.send(result);
    } catch (error) {
      res.status(500).send({
        error: 'Failed to fetch customer orders',
        message: error.message,
      });
    }
  });

  //get all orders for a specific seller
  app.get('/orders/seller/:email', verifyToken, async (req, res) => {
    const email = req.params.email;
    const query = { 'customer.email': email };

    try {
      const result = await ordersCollection
        .aggregate([
          {
            $match: query,
          },
          {
            $addFields: {
              plantId: { $toObjectId: '$plantId' },
            },
          },
          {
            $lookup: {
              from: 'plants',
              localField: 'plantId',
              foreignField: '_id',
              as: 'plants',
            },
          },
          {
            $unwind: '$plants',
          },
          {
            $addFields: {
              name: '$plants.name',
              image: '$plants.image',
              category: '$plants.category',
            },
          },
          {
            $project: {
              // price: 1,
              // name: 1,
              plants: 0,
            },
          },
        ])
        .toArray();

      res.send(result);
    } catch (error) {
      res.status(500).send({
        error: 'Failed to fetch customer orders',
        message: error.message,
      });
    }
  });
  //cancel delete an order
  app.delete('/orders/:id', verifyToken, async (req, res) => {
    const id = req.params.id;
    const query = { _id: new ObjectId(id) };
    const order = await ordersCollection.findOne(query);
    if (order.status === 'Delivered') {
      return res.status(409).send({ message: 'Order already delivetred' });
    }

    const result = await ordersCollection.deleteOne(query);
    res.send(result);
  });
  // app.get('/admin-start', async (req, res) => {

  //   try {
  //     const totalUser = await userCollection.countDocuments();
  //     const totalPlants = await plantsCollection.estimatedDocumentCount();
  //     const totalOrder = await ordersCollection.estimatedDocumentCount();

  //     const orders = await ordersCollection.find().toArray();
  //     const totalPrice = orders.reduce(
  //       (sum, order) => sum + (order.price || 0),
  //       0
  //     );

  //     res.send({ totalUser, totalPlants, totalOrder, totalPrice });
  //   } catch (error) {
  //     console.error('Error fetching admin statistics:', error);
  //     res.status(500).send({ error: 'Internal Server Error' });
  //   }
  // });

  app.get('/admin-stat', verifyToken, verifyAdmin, async (req, res) => {
    // get total user, total plants
    const totalUser = await userCollection.estimatedDocumentCount();
    const totalPlants = await plantsCollection.estimatedDocumentCount();

    const allOrder = await ordersCollection.find().toArray();
    // const totalOrders = allOrder.length
    // const totalPrice = allOrder.reduce((sum, order) => sum + order.price, 0)

    // const myData = {
    //   date: '11/01/2025',
    //   quantity: 12,
    //   price: 1500,
    //   order: 3,
    // }
    // generate chart data
    const chartData = await ordersCollection
      .aggregate([
        { $sort: { _id: -1 } },
        {
          $addFields: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: { $toDate: '$_id' },
              },
            },
            quantity: {
              $sum: '$quantity',
            },
            price: { $sum: '$price' },
            order: { $sum: 1 },
          },
        },

        {
          $project: {
            _id: 0,
            date: '$_id',
            quantity: 1,
            order: 1,
            price: 1,
          },
        },
      ])
      .toArray();

    // get total revenue, total order
    const ordersDetails = await ordersCollection
      .aggregate([
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$price' },
            totalOrder: { $sum: 1 },
          },
        },
        {
          $project: {
            _id: 0,
          },
        },
      ])
      .next();

    res.send({
      totalPlants,
      totalUser,
      ...ordersDetails,
      chartData,
    });
  });

  app.post('/creact-payment-intent', verifyToken, async (req, res) => {
    const { quantity, plantId } = req.body;
    const plant = await plantsCollection.findOne({
      _id: new ObjectId(plantId),
    });
    if (!plant) {
      return res.status(400).send({ message: 'Plant not Found' });
    }
    const totalPrice = quantity * plant.price * 100;
    console.log(totalPrice);
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
