const express = require('express')
const router = express.Router()

// Project Module, Schema & Utils imports
const getRaceMeetings = require('../modules/getRaceMeetings.js')
const getAllRaces = require('../modules/getAllRaces')
const getAllMeetingRaces = require('../modules/getAllMeetingRaces')
const getRace = require('../modules/getRace')

// Race Meetings endpoint - Return an object containing today's race meetings in detail
router.get('/racemeetings', async (request, response, next) => {
  try {
    console.log('\x1b[36m%s\x1b[0m', "Fetching Today's Race Meetings..")
    const result = await getRaceMeetings()
    console.log('\x1b[36m%s\x1b[0m', 'Meetings Fetched Successfully!')
    return response.status(200).send(result)
  } catch (err) {
    console.log('ERROR : ', err)
    return response.status(500).send(err)
  }
})

// All Races endpoint - Return an object containing today's race meetings in detail
router.get('/allraces', async (request, response, next) => {
  try {
    console.log('\x1b[36m%s\x1b[0m', 'Fetching All Races..')
    const result = await getAllRaces()
    console.log('\x1b[36m%s\x1b[0m', 'All Races fetched!')
    return response.status(200).send(result)
  } catch (err) {
    console.log('ERROR : ', err)
    return response.status(500).send(err)
  }
})

// All Races endpoint - Return an object containing all of today's races for a single meeting
router.get('/allmeetingraces/', async (request, response, next) => {
  try {
    const { url } = request.query
    console.log('\x1b[36m%s\x1b[0m', `Fetching Races for URL: `, url)
    const result = await getAllMeetingRaces(url)
    console.log('\x1b[36m%s\x1b[0m', 'All Races for Meeting Fetched')
    return response.status(200).send(result)
  } catch (err) {
    console.log('ERROR : ', err)
    return response.status(500).send(err)
  }
})

// A Single Race endpoint - Return an object containing details for a single race
router.get('/race/', async (request, response, next) => {
  try {
    const { url } = request.query
    console.log(
      '\x1b[36m%s\x1b[0m',
      'Fetching data for a single race URL: ',
      url
    )
    const result = await getRace(url)
    console.log('\x1b[36m%s\x1b[0m', 'Single Race Data Fetched!')
    return response.status(200).send(result)
  } catch (err) {
    console.log('ERROR : ', err)
    return response.status(500).send(err)
  }
})

// catch all other paths and return an error
router.get('*', async (request, response, next) => {
  try {
    const url = request.url
    console.log('\x1b[36m%s\x1b[0m', 'Invalid URL Path Detected! ', url)
    throw Error(`Invalid URL: ${url}`)
  } catch (err) {
    console.log('ERROR : ', err)
    return response.status(500).send(err)
  }
})

module.exports = router
