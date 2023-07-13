const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const jwt = require("jsonwebtoken");
const app = express();
const port = process.env.PORT || 5000;

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

    //get all product
    app.get("/products", async (req, res) => {
      const result = await productsCollection.find().toArray();
      res.send(result);
    });

    //get all carts items
    app.get("/allCarts/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const query = { userEmail: email };
      const result = await cartCollection.find(query).toArray();
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
      } else if (itemQuantity > 0) {
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
    app.get("/category", async(req,res)=>{
      const result = await categoryCollection.find().toArray()
      res.send(result)
    })

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
