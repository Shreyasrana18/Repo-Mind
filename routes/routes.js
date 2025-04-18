const express = require('express')
const controller = require('../controllers/github-extraction')

const router = express.Router()

router.get('/test', controller.test)
router.get('/scrape', controller.scrape)

module.exports = router