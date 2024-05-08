// Main RaceDay API Server

const port = process.env.PORT || 5000
const app = require('./app')

// Start Server listening on specified port
app.listen(port, () => {
  try {
    console.log('\x1b[32m', `API server started at http://localhost:${port}`)
  } catch (err) {
    // Show error if API Server cannot be started
    console.log(
      '\x1b[31m%s\x1b[0m',
      'Error starting the RaceDay API Server. Try re-starting the application.',
      err
    )
  }
})
