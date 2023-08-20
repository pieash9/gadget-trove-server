const express = require("express");

const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const SSLCommerzPayment = require("sslcommerz-lts");
const jwt = require("jsonwebtoken");
const app = express();
const port = process.env.PORT || 5000;
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);

// ssl commerz pass and user
const store_id = process.env.STORE_ID;
const store_passwd = process.env.STORE_PASS;
const is_live = false; //true for live, false for sandbox

//middleware
app.use(cors());
app.use(express.json());

//validate jwt
const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status({ error: true, message: "Unauthorized access" });
  }
  const token = authorization.split(" ")[1];
  //token verify
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (error, decode) => {
    if (error) {
      return res
        .status(401)
        .send({ error: true, message: "Unauthorized access" });
    }
    req.decode = decode;
    next();
  });
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.fiktc6e.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    const productsCollection = client
      .db("gadgetTroveDb")
      .collection("products");
    const cartCollection = client.db("gadgetTroveDb").collection("carts");
    const userCollection = client.db("gadgetTroveDb").collection("users");
    const orderCollection = client.db("gadgetTroveDb").collection("orders");
    const categoryCollection = client
      .db("gadgetTroveDb")
      .collection("category");

    //generate jwt token
    app.post("/jwt", async (req, res) => {
      const email = req.body;
      const token = jwt.sign(email, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1D",
      });
      res.send(token);
    });

    // stripe payment generate client secret
    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      try {
        const { price } = req.body;
        if (price) {
          const amount = parseFloat(price) * 100;
          const paymentIntent = await stripe.paymentIntents.create({
            amount: amount,
            currency: "usd",
            payment_method_types: ["card"],
          });
          res.send({
            clientSecret: paymentIntent.client_secret,
          });
        }
      } catch (error) {
        console.log(error);
      }
    });

    app.post("/orders/stripe", verifyJWT, async (req, res) => {
      const allCart = req.body.allCarts;
      const formData = req.body.formData;
      const tran_id = req.body.tran_id;
      const createdAt = req.body.createdAt;

      const finalOrder = {
        allCart: allCart.map((item) => {
          const { _id, ...newItem } = item; // Destructure and omit _id
          return {
            ...newItem, // Use the newItem object without _id
            productID: _id, // Assign _id to productID
            paidStatus: false,
            tran_id: tran_id,
            createdAt,
            cusName: formData.name,
            deliveryAddress: formData.deliveryAddress,
            number: formData.number,
            districtName: formData.districtName,
            cityName: formData.cityName,
            cus_email: formData.email,
          };
        }),
      };
      // save to database
      const singleOrder = finalOrder.allCart[0];

      if (finalOrder.allCart.length > 1) {
        // if cart length is greater than 1
        await orderCollection.insertMany(finalOrder.allCart);
      } else {
        await orderCollection.insertOne(singleOrder);
      }
      res.redirect(`http://localhost:5173/payment/success/${tran_id}`);
    });

    // order payment by SSLCOMMERZ
    app.post("/orders", async (req, res) => {
      const productsPrice = req.body.totalPrice;
      const allCart = req.body.allCarts;
      const formData = req.body.formData;
      const tran_id = "trx" + new ObjectId();

      const data = {
        total_amount: productsPrice,
        currency: "USD",
        tran_id: tran_id, // use unique tran_id for each api call
        success_url: `http://localhost:5000/payment/success/${tran_id}`,
        fail_url: `http://localhost:5000/payment/fail/${tran_id}`,
        cancel_url: `http://localhost:5000/payment/cancel/${tran_id}`,
        ipn_url: "http://localhost:3030/ipn",
        shipping_method: "Courier",
        product_name: "Computer.",
        product_category: "Electronic",
        product_profile: "general",
        cus_name: formData.name,
        cus_email: formData.email,
        cus_add1: formData.deliveryAddress,
        cus_add2: "Dhaka",
        cus_city: formData.districtName,
        cus_state: formData.cityName,
        cus_postcode: "1000",
        cus_country: "Bangladesh",
        cus_phone: formData.number,
        cus_fax: "01711111111",
        ship_name: formData.name,
        ship_add1: "Dhaka",
        ship_add2: "Dhaka",
        ship_city: "Dhaka",
        ship_state: "Dhaka",
        ship_postcode: 1000,
        ship_country: "Bangladesh",
      };

      const sslcz = new SSLCommerzPayment(store_id, store_passwd, is_live);
      sslcz.init(data).then((apiResponse) => {
        // Redirect the user to payment gateway
        let GatewayPageURL = apiResponse.GatewayPageURL;
        res.send({ url: GatewayPageURL });
        // console.log("Redirecting to: ", GatewayPageURL);
      });

      const finalOrder = {
        allCart: allCart.map((item) => {
          const { _id, ...newItem } = item; // Destructure and omit _id
          return {
            ...newItem, // Use the newItem object without _id
            productID: _id, // Assign _id to productID
            paidStatus: false,
            createdAt: new Date(),
            tran_id: tran_id,
            cusName: formData.name,
            deliveryAddress: formData.deliveryAddress,
            number: formData.number,
            districtName: formData.districtName,
            cityName: formData.cityName,
            cus_email: formData.email,
          };
        }),
      };

      // save to database
      const singleOrder = finalOrder.allCart[0];

      if (finalOrder.allCart.length > 1) {
        // if cart length is greater than 1
        await orderCollection.insertMany(finalOrder.allCart);
      } else {
        await orderCollection.insertOne(singleOrder);
      }

      //? payment success
      app.post("/payment/success/:tran_id", async (req, res) => {
        const tran_id = req.params.tran_id;
        const productData = await orderCollection
          .find({ tran_id: tran_id })
          .toArray();

        if (productData.length > 1) {
          await orderCollection.updateMany(
            { tran_id: tran_id },
            { $set: { paidStatus: true } },
            { multi: true }
          );
        } else {
          await orderCollection.updateOne(
            { tran_id: tran_id },
            { $set: { paidStatus: true } }
          );
        }
        res.redirect(`http://localhost:5173/payment/success/${tran_id}`);
      });

      //! payment fail
      app.post("/payment/fail/:tran_id", async (req, res) => {
        const tran_id = req.params.tran_id;
        const productData = await orderCollection
          .find({ tran_id: tran_id })
          .toArray();

        let result;
        if (productData.length > 1) {
          result = await orderCollection.deleteMany({ tran_id: tran_id });
        } else {
          result = await orderCollection.deleteOne({ tran_id: tran_id });
        }

        if (result.deletedCount) {
          res.redirect(`http://localhost:5173/payment/fail/${tran_id}`);
        }
      });

      //! payment cancel
      app.post("/payment/cancel/:tran_id", async (req, res) => {
        const tran_id = req.params.tran_id;
        const productData = await orderCollection
          .find({ tran_id: tran_id })
          .toArray();

        let result;
        if (productData.length > 1) {
          result = await orderCollection.deleteMany({ tran_id: tran_id });
        } else {
          result = await orderCollection.deleteOne({ tran_id: tran_id });
        }

        if (result.deletedCount) {
          res.redirect(`http://localhost:5173/payment/cancel/${tran_id}`);
        }
      });
    });
    //get all users
    app.get("/users", verifyJWT, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    //post user  to server
    app.post("/users", async (req, res) => {
      const userInfo = req.body;
      if (await userCollection.findOne({ email: userInfo.email })) {
        return;
      }
      const result = await userCollection.insertOne(userInfo);
      res.send(result);
    });

    //change user role
    app.patch("/users/:id", async (req, res) => {
      const id = req.params.id;
      const userRole = req.body;
      const query = { _id: new ObjectId(id) };
      const updateDoc = { $set: userRole };
      const result = await userCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // delete a user
    app.delete("/users/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.send(result);
    });

    //get all product
    app.get("/products", async (req, res) => {
      const result = await productsCollection.find().toArray();
      res.send(result);
    });

    //get product by id
    app.get("/singleProducts/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await productsCollection.findOne(query);
      res.send(result);
    });
    //get product by category
    app.get("/products/:category", async (req, res) => {
      const category = req.params.category;
      const result = await productsCollection
        .find({ category: category })
        .toArray();
      res.send(result);
    });

    //New arrival products
    app.get("/newProducts", async (req, res) => {
      const result = await productsCollection
        .find()
        .sort({ createdDate: -1 })
        .limit(6)
        .toArray();
      res.send(result);
    });

    //get all carts items
    app.get("/allCarts/:email", async (req, res) => {
      const email = req.params.email;
      const query = { userEmail: email };
      const result = await cartCollection.find(query).toArray();
      res.send(result);
    });

    //get product for a seller
    app.get("/sellerProducts/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      if (email) {
        const query = { sellerEmail: email };
        const result = await productsCollection.find(query).toArray();
        res.send(result);
      }
    });

    //create new product
    app.post("/products", verifyJWT, async (req, res) => {
      const product = req.body;
      const updateDoc = {
        ...product,
        status: "pending",
      };
      const result = await productsCollection.insertOne(updateDoc);
      res.send(result);
    });

    //update a product by a seller
    app.patch("/products/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const product = req.body;
      const query = { _id: new ObjectId(id) };
      const updateDoc = { $set: { ...product, status: "pending" } };
      const result = await productsCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // update product status by admin //TODO verify admin
    app.patch("/changeProductStatus/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const status = req.body;
      const updateDoc = { $set: status };
      const result = await productsCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // delete a product
    app.delete("/products/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await productsCollection.deleteOne(query);
      res.send(result);
    });

    //add to cart by quantity
    app.put("/carts", verifyJWT, async (req, res) => {
      const query = req.body;
      const userEmail = query.userEmail;
      const quantity = query.quantity;
      const productID = query.productID;

      // Check if the cart item already exists
      const existingCartItem = await cartCollection.findOne({
        userEmail: userEmail,
        productID: productID,
      });

      let result;

      if (existingCartItem) {
        // If cart item exists, update the quantity
        result = await cartCollection.updateOne(
          { userEmail: userEmail, productID: productID },
          { $inc: { quantity: quantity } }
        );
      } else {
        // If cart item doesn't exist, create a new cart item
        result = await cartCollection.insertOne(query);
      }

      res.send(result);
    });

    //update cart item quantity
    app.patch("/carts/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const quantity = req.query.quantity;
      const query = { _id: new ObjectId(id) };

      const item = await cartCollection.findOne(query);
      const itemQuantity = item.quantity;
      // console.log(itemQuantity);

      let updateDoc = {};

      if (quantity == 1) {
        updateDoc = {
          $inc: { quantity: 1 },
        };
      } else if (itemQuantity > 1) {
        updateDoc = {
          $inc: { quantity: -1 },
        };
      } else {
        return;
      }
      const result = await cartCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    //delete item from cart
    app.delete("/carts/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await cartCollection.deleteOne(query);
      res.send(result);
    });

    //get all category
    app.get("/category", async (req, res) => {
      const result = await categoryCollection.find().toArray();
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Gadget Trove server is running");
});

app.listen(port, () => {
  console.log("Gadget Trove server is running at", port);
});
