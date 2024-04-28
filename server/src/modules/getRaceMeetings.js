// Function to Connect to the Australian TAB API and query all race meetings for 'today'

// REf URL to get active links for todays racing -  "https://api.beta.tab.com.au/v1/tab-info-service/racing/dates/YYYY-MM-DD/meetings?jurisdiction=NSW"
// This will return an array with todays race meetings

const getRaceMeetings = async (req, res, next) => {
  const today = new Date()
  const year = today.getFullYear()
  const month = ('0' + (today.getMonth() + 1)).slice(-2)
  const day = ('0' + today.getDate()).slice(-2)
  const date = `${year}-${month}-${day}`
  const jurisdiction = 'NSW'

  try {
    // Fetch object containing links to meetings for the specified date
    const url = `https://api.beta.tab.com.au/v1/tab-info-service/racing/dates/${date}/meetings?jurisdiction=${jurisdiction}`
    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data = await response.json()
    return data
  } catch (err) {
    console.error(err.message)
    throw err
  }
}

module.exports = getRaceMeetings
