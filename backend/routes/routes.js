const express = require('express')
const controller = require('../controllers/github-extraction')
const searchController = require('../controllers/search-controller.js')

const router = express.Router()

router.get('/test', controller.test)
router.get('/scrape', controller.scrape)

router.get('/search', searchController.search)

module.exports = router