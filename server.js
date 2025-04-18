const express = require('express')
require('dotenv').config()
const route = require('./routes/routes')

const app = express()
const PORT = process.env.PORT || 5002

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use("/api", route)

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`)
})