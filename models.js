const mongoose = require('mongoose')

const userSchema = new mongoose.Schema({
username: { type: String, required: true },
email: { type: String, required: true, unique: true },
password: { type: String, required: true },
role: { type: String, default: 'user' },
plan: { type: String, default: 'free' },
planExpire: { type: Date }
})

const contentSchema = new mongoose.Schema({
title: String,
body: String,
isPremium: Boolean
})

const blacklist = new mongoose.Schema({
token: String
})

const User = mongoose.model('User', userSchema)
const Content = mongoose.model('Content', contentSchema)
const Black = mongoose.model('Blacklist', blacklist)

module.exports = { User, Content, Black }
