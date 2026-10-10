const express = require('express')
const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const cors = require('cors')
const models = require('./models')

const User = models.User;
const Content = models.Content;
const Black = models.Black;

const app = express();
app.use(express.json());
app.use(cors());

mongoose.connect("mongodb://127.0.0.1:27017/myproject_db").then(function() {
    console.log("db connected successfully yay");
}).catch(function(err) {
    console.log("error connecting to db: " + err)
});

const jwtSecret = "mysecretkey_donttellanyone"
const refreshSecret = "refreshsecretkey_wow"

function checkToken(req, res, next) {
    let token = req.headers.authorization;
    
    if (!token) {
        return res.status(401).send("no token provided bro")
    }
    
    token = token.split(" ")[1];
      
    Black.findOne({ token: token }).then(function(found) {
        if (found) {
            return res.status(401).send("token blacklisted, log back in")
        }
        
        jwt.verify(token, jwtSecret, function(err, decoded) {
            if (err) {
                return res.status(401).send("invalid token or expired");
            }
            req.user = decoded;
            next();
        });
    });
}

app.post('/signup', async function(req, res) {
    try {
        const email = req.body.email
        const pasword = req.body.password
        const username = req.body.username
        const role = req.body.role
        
        const salt = bcrypt.genSaltSync(10);
        const hash = bcrypt.hashSync(pasword, salt)
        
        const newUser = new User({
            email: email,
            password: hash,
            username: username,
            role: role || 'user', // fallback just in case
            plan: 'free'
        });
        
        await newUser.save();
        res.send({ msg: "user created successfully!" });
    } catch(e) {
        console.log("signup error:", e)
        res.status(500).send("server error during signup")
    }
});

app.post('/login', async function(req, res) {
    const email = req.body.email;
    const p = req.body.password;
      
    const user = await User.findOne({ email: email })
    if (!user) {
        return res.status(404).send("user not found check email");
    }
      
    const check = bcrypt.compareSync(p, user.password);
    if (!check) {
        return res.status(400).send("wrong password mate");
    }
      
    const access = jwt.sign({ id: user._id, role: user.role, plan: user.plan }, jwtSecret, { expiresIn: '15m' });
    const refresh = jwt.sign({ id: user._id }, refreshSecret, { expiresIn: '7d' });
      
    res.json({ accessToken: access, refreshToken: refresh });
});

app.post('/logout', checkToken, async function(req, res) {
    const token = req.headers.authorization.split(" ")[1];
    const b = new Black({ token: token })
    await b.save();
      
    if (req.body.refreshToken) {
        const b2 = new Black({ token: req.body.refreshToken });
        await b2.save();
    }
      
    res.send("logged out successfully");
});

app.post('/refresh', async function(req, res) {
    const refToken = req.body.refreshToken;
    if (!refToken) return res.status(400).send("need refresh token in body");
      
    const isBlack = await Black.findOne({ token: refToken });
    if (isBlack) return res.status(401).send("refresh token is blacklisted");
      
    jwt.verify(refToken, refreshSecret, async function(err, decoded) {
        if (err) return res.status(401).send("bad refresh token");
        
        const user = await User.findById(decoded.id);
        const newAccess = jwt.sign({ id: user._id, role: user.role, plan: user.plan }, jwtSecret, { expiresIn: '15m' });
        res.json({ accessToken: newAccess })
    });
});

app.post('/subscribe', checkToken, async function(req, res) {
    const plan = req.body.plan;
    const user = await User.findById(req.user.id)
      
    if (plan == 'premium' || plan == 'pro') {
        user.plan = plan;
        const d = new Date();
        d.setDate(d.getDate() + 30); 
        user.planExpire = d;
        await user.save();
        res.send("subscribed to " + plan);
    } else {
        res.status(400).send("invalid plan type bro")
    }
});

app.get('/subscription-status', checkToken, async function(req, res) {
    const user = await User.findById(req.user.id);
      
    if (user.planExpire) {
        const now = new Date();
        if (now > user.planExpire) {
            user.plan = 'free';
            user.planExpire = null;
            await user.save();
            return res.send({ status: "expired, moved to free" });
        } else {
            return res.send({ plan: user.plan, expire: user.planExpire });
        }
    } else {
        res.send({ plan: "free" });
    }
});

app.patch('/renew', checkToken, async function(req, res) {
    const user = await User.findById(req.user.id)
    if (user.plan == 'free') {
        return res.status(400).send("free users cant renew, subscribe first");
    }
      
    const d = new Date(user.planExpire)
    d.setDate(d.getDate() + 30);
    user.planExpire = d;
    await user.save()
    res.send("renewed for another month")
});

app.post('/cancel-subscription', checkToken, async function(req, res) {
    const user = await User.findById(req.user.id);
    user.plan = 'free';
    user.planExpire = null;
    await user.save();
    res.send("subscription canceled");
});

// Public content
app.get('/content/free', async function(req, res) {
    const c = await Content.find({ isPremium: false });
    res.json(c);
});

app.get('/content/premium', checkToken, async function(req, res) {
    const user = await User.findById(req.user.id);
      
    if (user.planExpire) {
        const now = new Date();
        if (now > user.planExpire) {
            user.plan = 'free';
            user.planExpire = null;
            await user.save();
        }
    }
      
    if (user.plan == 'premium' || user.plan == 'pro') {
        const c = await Content.find(); 
        res.json(c);
    } else {
        res.status(403).send("buy premium to see this content!!")
    }
});

app.post('/content', checkToken, async function(req, res) {
    if (req.user.role != 'admin') {
        return res.status(403).send("not admin, get out")
    }
      
    const c = new Content({
        title: req.body.title,
        body: req.body.body,
        isPremium: req.body.isPremium
    });
      
    await c.save();
    res.send("content created");
});

app.delete('/content/:id', checkToken, async function(req, res) {
    if (req.user.role != 'admin') {
        return res.status(403).send("not admin!!");
    }
      
    await Content.findByIdAndDelete(req.params.id)
    res.send("deleted successfully")
});

app.post('/purchase', checkToken, async function(req, res) {
    let itemPrice = 100
    const user = await User.findById(req.user.id)
    if (user.plan == 'pro') {
        itemPrice = 80
    }
    res.send("you paid " + itemPrice)
});

app.listen(3000, function() {
    console.log("server running on port 3000... let's go!")
});