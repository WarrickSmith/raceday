#!/usr/bin/env node

import { config as loadEnv } from 'dotenv'
import {
  Client,
  Databases,
  Permission,
  Role,
  IndexType,
  RelationshipType,
} from 'node-appwrite'

// Load environment variables from .env.local
loadEnv({ path: '.env.local' })

// Configuration
const config = {
  endpoint: process.env.APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1',
  projectId: process.env.APPWRITE_PROJECT_ID || '',
  apiKey: process.env.APPWRITE_API_KEY || '',
  databaseId: 'raceday-db',
  collections: {
    meetings: 'meetings',
    races: 'races',
    entrants: 'entrants',
    oddsHistory: 'odds-history',
    moneyFlowHistory: 'money-flow-history',
    userAlertConfigs: 'user-alert-configs',
    notifications: 'notifications',
  },
}

// Initialize Appwrite client
const client = new Client()
  .setEndpoint(config.endpoint)
  .setProject(config.projectId)
  .setKey(config.apiKey)

const databases = new Databases(client)

// Utility function for logging
const log = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
  const prefix = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'
  console.log(`${prefix} ${message}`)
}

// Check if resource exists (idempotent helper)
const resourceExists = async (
  checkFn: () => Promise<unknown>
): Promise<boolean> => {
  try {
    await checkFn()
    return true
  } catch (error: unknown) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 404
    ) {
      return false
    }
    throw error
  }
}

// Check if attribute exists (idempotent helper for attributes)
const attributeExists = async (
  collectionId: string,
  attributeKey: string
): Promise<boolean> => {
  try {
    const collection = await databases.getCollection(
      config.databaseId,
      collectionId
    )
    const attribute = collection.attributes.find(
      (attr: { key: string; status?: string }) => attr.key === attributeKey
    )
    return !!attribute // Return true if attribute exists, regardless of status
  } catch (error: unknown) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 404
    ) {
      return false
    }
    throw error
  }
}

// Check if attribute is available for index creation
const isAttributeAvailable = async (
  collectionId: string,
  attributeKey: string
): Promise<boolean> => {
  try {
    const collection = await databases.getCollection(
      config.databaseId,
      collectionId
    )
    const attribute = collection.attributes.find(
      (attr: { key: string; status?: string }) => attr.key === attributeKey
    )
    return attribute?.status === 'available'
  } catch {
    return false
  }
}

// Wait for attribute to become available
const waitForAttributeAvailable = async (
  collectionId: string,
  attributeKey: string,
  maxRetries: number = 10,
  delayMs: number = 1000
): Promise<boolean> => {
  for (let i = 0; i < maxRetries; i++) {
    if (await isAttributeAvailable(collectionId, attributeKey)) {
      return true
    }
    log(
      `Waiting for attribute ${attributeKey} to become available... (${
        i + 1
      }/${maxRetries})`
    )
    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }
  return false
}

// Create database
const createDatabase = async () => {
  log('Creating database...')

  const exists = await resourceExists(() => databases.get(config.databaseId))

  if (exists) {
    log('Database already exists, skipping creation', 'info')
    return
  }

  await databases.create(config.databaseId, 'RaceDay Database')
  log('Database created successfully', 'success')
}

// Create Meetings collection
const createMeetingsCollection = async () => {
  log('Creating Meetings collection...')

  const exists = await resourceExists(() =>
    databases.getCollection(config.databaseId, config.collections.meetings)
  )

  if (exists) {
    log('Meetings collection already exists, skipping creation', 'info')
  } else {
    await databases.createCollection(
      config.databaseId,
      config.collections.meetings,
      'Meetings',
      [
        Permission.read(Role.any()),
        Permission.create(Role.users()),
        Permission.update(Role.users()),
        Permission.delete(Role.users()),
      ]
    )
  }

  // Create attributes (check if they exist first)
  if (!(await attributeExists(config.collections.meetings, 'meetingId'))) {
    await databases.createStringAttribute(
      config.databaseId,
      config.collections.meetings,
      'meetingId',
      50,
      true
    )
  }

  if (!(await attributeExists(config.collections.meetings, 'meetingName'))) {
    await databases.createStringAttribute(
      config.databaseId,
      config.collections.meetings,
      'meetingName',
      255,
      true
    )
  }

  if (!(await attributeExists(config.collections.meetings, 'country'))) {
    await databases.createStringAttribute(
      config.databaseId,
      config.collections.meetings,
      'country',
      10,
      true
    )
  }

  if (!(await attributeExists(config.collections.meetings, 'raceType'))) {
    await databases.createStringAttribute(
      config.databaseId,
      config.collections.meetings,
      'raceType',
      50,
      true
    )
  }

  if (!(await attributeExists(config.collections.meetings, 'date'))) {
    await databases.createDatetimeAttribute(
      config.databaseId,
      config.collections.meetings,
      'date',
      true
    )
  }

  if (!(await attributeExists(config.collections.meetings, 'trackCondition'))) {
    await databases.createStringAttribute(
      config.databaseId,
      config.collections.meetings,
      'trackCondition',
      50,
      false
    )
  }

  if (!(await attributeExists(config.collections.meetings, 'status'))) {
    await databases.createStringAttribute(
      config.databaseId,
      config.collections.meetings,
      'status',
      50,
      true
    )
  }

  // Create indexes (check if they exist first)
  const collection = await databases.getCollection(
    config.databaseId,
    config.collections.meetings
  )

  if (
    !collection.indexes.some((idx: { key: string }) => idx.key === 'idx_date')
  ) {
    log('Creating idx_date index on date...')

    // Wait for date attribute to be available
    const isAvailable = await waitForAttributeAvailable(
      config.collections.meetings,
      'date'
    )
    if (!isAvailable) {
      log(
        'date attribute is not available for index creation, skipping idx_date index',
        'error'
      )
    } else {
      try {
        await databases.createIndex(
          config.databaseId,
          config.collections.meetings,
          'idx_date',
          IndexType.Key,
          ['date']
        )
        log('idx_date index created successfully')
      } catch (error) {
        log(`Failed to create idx_date index: ${error}`, 'error')
        // Don't throw error for index creation failures, just log and continue
      }
    }
  }

  if (
    !collection.indexes.some(
      (idx: { key: string }) => idx.key === 'idx_country'
    )
  ) {
    const isAvailable = await waitForAttributeAvailable(
      config.collections.meetings,
      'country'
    )
    if (isAvailable) {
      try {
        await databases.createIndex(
          config.databaseId,
          config.collections.meetings,
          'idx_country',
          IndexType.Key,
          ['country']
        )
        log('idx_country index created successfully')
      } catch (error) {
        log(`Failed to create idx_country index: ${error}`, 'error')
      }
    } else {
      log(
        'country attribute is not available for index creation, skipping idx_country index',
        'error'
      )
    }
  }

  if (
    !collection.indexes.some(
      (idx: { key: string }) => idx.key === 'idx_race_type'
    )
  ) {
    const isAvailable = await waitForAttributeAvailable(
      config.collections.meetings,
      'raceType'
    )
    if (isAvailable) {
      try {
        await databases.createIndex(
          config.databaseId,
          config.collections.meetings,
          'idx_race_type',
          IndexType.Key,
          ['raceType']
        )
        log('idx_race_type index created successfully')
      } catch (error) {
        log(`Failed to create idx_race_type index: ${error}`, 'error')
      }
    } else {
      log(
        'raceType attribute is not available for index creation, skipping idx_race_type index',
        'error'
      )
    }
  }

  if (
    !collection.indexes.some(
      (idx: { key: string }) => idx.key === 'idx_meeting_id'
    )
  ) {
    const isAvailable = await waitForAttributeAvailable(
      config.collections.meetings,
      'meetingId'
    )
    if (isAvailable) {
      try {
        await databases.createIndex(
          config.databaseId,
          config.collections.meetings,
          'idx_meeting_id',
          IndexType.Unique,
          ['meetingId']
        )
        log('idx_meeting_id index created successfully')
      } catch (error) {
        log(`Failed to create idx_meeting_id index: ${error}`, 'error')
      }
    } else {
      log(
        'meetingId attribute is not available for index creation, skipping idx_meeting_id index',
        'error'
      )
    }
  }

  log('Meetings collection created successfully', 'success')
}

// Create Races collection
const createRacesCollection = async () => {
  log('Creating Races collection...')

  const exists = await resourceExists(() =>
    databases.getCollection(config.databaseId, config.collections.races)
  )

  if (exists) {
    log('Races collection already exists, skipping creation', 'info')
  } else {
    await databases.createCollection(
      config.databaseId,
      config.collections.races,
      'Races',
      [
        Permission.read(Role.any()),
        Permission.create(Role.users()),
        Permission.update(Role.users()),
        Permission.delete(Role.users()),
      ]
    )
  }

  // Create attributes (check if they exist first)
  if (!(await attributeExists(config.collections.races, 'raceId'))) {
    await databases.createStringAttribute(
      config.databaseId,
      config.collections.races,
      'raceId',
      50,
      true
    )
  }

  if (!(await attributeExists(config.collections.races, 'name'))) {
    await databases.createStringAttribute(
      config.databaseId,
      config.collections.races,
      'name',
      255,
      true
    )
  }

  if (!(await attributeExists(config.collections.races, 'raceNumber'))) {
    await databases.createIntegerAttribute(
      config.databaseId,
      config.collections.races,
      'raceNumber',
      true
    )
  }

  if (!(await attributeExists(config.collections.races, 'startTime'))) {
    await databases.createDatetimeAttribute(
      config.databaseId,
      config.collections.races,
      'startTime',
      true
    )
  }

  if (!(await attributeExists(config.collections.races, 'distance'))) {
    await databases.createIntegerAttribute(
      config.databaseId,
      config.collections.races,
      'distance',
      false
    )
  }

  if (!(await attributeExists(config.collections.races, 'trackCondition'))) {
    await databases.createStringAttribute(
      config.databaseId,
      config.collections.races,
      'trackCondition',
      100,
      false
    )
  }

  if (!(await attributeExists(config.collections.races, 'weather'))) {
    await databases.createStringAttribute(
      config.databaseId,
      config.collections.races,
      'weather',
      50,
      false
    )
  }

  if (!(await attributeExists(config.collections.races, 'status'))) {
    await databases.createStringAttribute(
      config.databaseId,
      config.collections.races,
      'status',
      50,
      true
    )
  }

  if (!(await attributeExists(config.collections.races, 'actualStart'))) {
    await databases.createDatetimeAttribute(
      config.databaseId,
      config.collections.races,
      'actualStart',
      false
    )
  }

  if (!(await attributeExists(config.collections.races, 'silkUrl'))) {
    await databases.createStringAttribute(
      config.databaseId,
      config.collections.races,
      'silkUrl',
      500,
      false
    )
  }

  // Relationship to meetings (check if it exists first)
  if (!(await attributeExists(config.collections.races, 'meeting'))) {
    await databases.createRelationshipAttribute(
      config.databaseId,
      config.collections.races,
      config.collections.meetings,
      RelationshipType.ManyToOne,
      false,
      'meeting',
      'races'
    )
  }

  // Create indexes (check if they exist first)
  const collection = await databases.getCollection(
    config.databaseId,
    config.collections.races
  )

  if (
    !collection.indexes.some(
      (idx: { key: string }) => idx.key === 'idx_race_id'
    )
  ) {
    const isAvailable = await waitForAttributeAvailable(
      config.collections.races,
      'raceId'
    )
    if (isAvailable) {
      try {
        await databases.createIndex(
          config.databaseId,
          config.collections.races,
          'idx_race_id',
          IndexType.Unique,
          ['raceId']
        )
        log('idx_race_id index created successfully')
      } catch (error) {
        log(`Failed to create idx_race_id index: ${error}`, 'error')
      }
    } else {
      log(
        'raceId attribute is not available for index creation, skipping idx_race_id index',
        'error'
      )
    }
  }

  if (
    !collection.indexes.some(
      (idx: { key: string }) => idx.key === 'idx_start_time'
    )
  ) {
    const isAvailable = await waitForAttributeAvailable(
      config.collections.races,
      'startTime'
    )
    if (isAvailable) {
      try {
        await databases.createIndex(
          config.databaseId,
          config.collections.races,
          'idx_start_time',
          IndexType.Key,
          ['startTime']
        )
        log('idx_start_time index created successfully')
      } catch (error) {
        log(`Failed to create idx_start_time index: ${error}`, 'error')
      }
    } else {
      log(
        'startTime attribute is not available for index creation, skipping idx_start_time index',
        'error'
      )
    }
  }

  if (
    !collection.indexes.some(
      (idx: { key: string }) => idx.key === 'idx_race_number'
    )
  ) {
    const isAvailable = await waitForAttributeAvailable(
      config.collections.races,
      'raceNumber'
    )
    if (isAvailable) {
      try {
        await databases.createIndex(
          config.databaseId,
          config.collections.races,
          'idx_race_number',
          IndexType.Key,
          ['raceNumber']
        )
        log('idx_race_number index created successfully')
      } catch (error) {
        log(`Failed to create idx_race_number index: ${error}`, 'error')
      }
    } else {
      log(
        'raceNumber attribute is not available for index creation, skipping idx_race_number index',
        'error'
      )
    }
  }

  log('Races collection created successfully', 'success')
}

// Create Entrants collection
const createEntrantsCollection = async () => {
  log('Creating Entrants collection...')

  const exists = await resourceExists(() =>
    databases.getCollection(config.databaseId, config.collections.entrants)
  )

  if (exists) {
    log('Entrants collection already exists, skipping creation', 'info')
  } else {
    await databases.createCollection(
      config.databaseId,
      config.collections.entrants,
      'Entrants',
      [
        Permission.read(Role.any()),
        Permission.create(Role.users()),
        Permission.update(Role.users()),
        Permission.delete(Role.users()),
      ]
    )
  }

  // Create attributes (check if they exist first)
  if (!(await attributeExists(config.collections.entrants, 'entrantId'))) {
    await databases.createStringAttribute(
      config.databaseId,
      config.collections.entrants,
      'entrantId',
      50,
      true
    )
  }

  if (!(await attributeExists(config.collections.entrants, 'name'))) {
    await databases.createStringAttribute(
      config.databaseId,
      config.collections.entrants,
      'name',
      255,
      true
    )
  }

  if (!(await attributeExists(config.collections.entrants, 'runnerNumber'))) {
    await databases.createIntegerAttribute(
      config.databaseId,
      config.collections.entrants,
      'runnerNumber',
      true
    )
  }

  if (!(await attributeExists(config.collections.entrants, 'jockey'))) {
    await databases.createStringAttribute(
      config.databaseId,
      config.collections.entrants,
      'jockey',
      255,
      false
    )
  }

  if (!(await attributeExists(config.collections.entrants, 'trainerName'))) {
    await databases.createStringAttribute(
      config.databaseId,
      config.collections.entrants,
      'trainerName',
      255,
      false
    )
  }

  if (!(await attributeExists(config.collections.entrants, 'weight'))) {
    await databases.createStringAttribute(
      config.databaseId,
      config.collections.entrants,
      'weight',
      50,
      false
    )
  }

  if (!(await attributeExists(config.collections.entrants, 'winOdds'))) {
    await databases.createFloatAttribute(
      config.databaseId,
      config.collections.entrants,
      'winOdds',
      false
    )
  }

  if (!(await attributeExists(config.collections.entrants, 'placeOdds'))) {
    await databases.createFloatAttribute(
      config.databaseId,
      config.collections.entrants,
      'placeOdds',
      false
    )
  }

  if (!(await attributeExists(config.collections.entrants, 'holdPercentage'))) {
    await databases.createFloatAttribute(
      config.databaseId,
      config.collections.entrants,
      'holdPercentage',
      false
    )
  }

  if (!(await attributeExists(config.collections.entrants, 'isScratched'))) {
    await databases.createBooleanAttribute(
      config.databaseId,
      config.collections.entrants,
      'isScratched',
      false,
      false
    )
  }

  if (!(await attributeExists(config.collections.entrants, 'silkUrl'))) {
    await databases.createStringAttribute(
      config.databaseId,
      config.collections.entrants,
      'silkUrl',
      500,
      false
    )
  }

  // Relationship to races (check if it exists first)
  if (!(await attributeExists(config.collections.entrants, 'race'))) {
    await databases.createRelationshipAttribute(
      config.databaseId,
      config.collections.entrants,
      config.collections.races,
      RelationshipType.ManyToOne,
      false,
      'race',
      'entrants'
    )
  }

  // Create indexes (check if they exist first)
  const collection = await databases.getCollection(
    config.databaseId,
    config.collections.entrants
  )

  if (
    !collection.indexes.some(
      (idx: { key: string }) => idx.key === 'idx_entrant_id'
    )
  ) {
    const isAvailable = await waitForAttributeAvailable(
      config.collections.entrants,
      'entrantId'
    )
    if (isAvailable) {
      try {
        await databases.createIndex(
          config.databaseId,
          config.collections.entrants,
          'idx_entrant_id',
          IndexType.Unique,
          ['entrantId']
        )
        log('idx_entrant_id index created successfully')
      } catch (error) {
        log(`Failed to create idx_entrant_id index: ${error}`, 'error')
      }
    } else {
      log(
        'entrantId attribute is not available for index creation, skipping idx_entrant_id index',
        'error'
      )
    }
  }

  if (
    !collection.indexes.some((idx: { key: string }) => idx.key === 'idx_runner_number')
  ) {
    const isAvailable = await waitForAttributeAvailable(
      config.collections.entrants,
      'runnerNumber'
    )
    if (isAvailable) {
      try {
        await databases.createIndex(
          config.databaseId,
          config.collections.entrants,
          'idx_runner_number',
          IndexType.Key,
          ['runnerNumber']
        )
        log('idx_runner_number index created successfully')
      } catch (error) {
        log(`Failed to create idx_runner_number index: ${error}`, 'error')
      }
    } else {
      log(
        'runnerNumber attribute is not available for index creation, skipping idx_runner_number index',
        'error'
      )
    }
  }

  log('Entrants collection created successfully', 'success')
}

// Create OddsHistory collection
const createOddsHistoryCollection = async () => {
  log('Creating OddsHistory collection...')

  const exists = await resourceExists(() =>
    databases.getCollection(config.databaseId, config.collections.oddsHistory)
  )

  if (exists) {
    log('OddsHistory collection already exists, skipping creation', 'info')
  } else {
    await databases.createCollection(
      config.databaseId,
      config.collections.oddsHistory,
      'OddsHistory',
      [
        Permission.read(Role.any()),
        Permission.create(Role.users()),
        Permission.update(Role.users()),
        Permission.delete(Role.users()),
      ]
    )
  }

  // Create attributes (check if they exist first)
  if (!(await attributeExists(config.collections.oddsHistory, 'odds'))) {
    await databases.createFloatAttribute(
      config.databaseId,
      config.collections.oddsHistory,
      'odds',
      true
    )
  }

  if (
    !(await attributeExists(config.collections.oddsHistory, 'eventTimestamp'))
  ) {
    await databases.createDatetimeAttribute(
      config.databaseId,
      config.collections.oddsHistory,
      'eventTimestamp',
      true
    )
  }

  if (!(await attributeExists(config.collections.oddsHistory, 'type'))) {
    await databases.createStringAttribute(
      config.databaseId,
      config.collections.oddsHistory,
      'type',
      20,
      true
    )
  }

  // Relationship to entrants (check if it exists first)
  if (!(await attributeExists(config.collections.oddsHistory, 'entrant'))) {
    await databases.createRelationshipAttribute(
      config.databaseId,
      config.collections.oddsHistory,
      config.collections.entrants,
      RelationshipType.ManyToOne,
      false,
      'entrant',
      'oddsHistory'
    )
  }

  // Create indexes (check if they exist first)
  const collection = await databases.getCollection(
    config.databaseId,
    config.collections.oddsHistory
  )

  if (
    !collection.indexes.some(
      (idx: { key: string }) => idx.key === 'idx_timestamp'
    )
  ) {
    const isAvailable = await waitForAttributeAvailable(
      config.collections.oddsHistory,
      'eventTimestamp'
    )
    if (isAvailable) {
      try {
        await databases.createIndex(
          config.databaseId,
          config.collections.oddsHistory,
          'idx_timestamp',
          IndexType.Key,
          ['eventTimestamp']
        )
        log('idx_timestamp index created successfully')
      } catch (error) {
        log(`Failed to create idx_timestamp index: ${error}`, 'error')
      }
    } else {
      log(
        'eventTimestamp attribute is not available for index creation, skipping idx_timestamp index',
        'info'
      )
    }
  }

  log('OddsHistory collection created successfully', 'success')
}

// Create MoneyFlowHistory collection
const createMoneyFlowHistoryCollection = async () => {
  log('Creating MoneyFlowHistory collection...')

  const exists = await resourceExists(() =>
    databases.getCollection(
      config.databaseId,
      config.collections.moneyFlowHistory
    )
  )

  if (exists) {
    log('MoneyFlowHistory collection already exists, skipping creation', 'info')
  } else {
    await databases.createCollection(
      config.databaseId,
      config.collections.moneyFlowHistory,
      'MoneyFlowHistory',
      [
        Permission.read(Role.any()),
        Permission.create(Role.users()),
        Permission.update(Role.users()),
        Permission.delete(Role.users()),
      ]
    )
  }

  // Create attributes (check if they exist first)
  if (!(await attributeExists(config.collections.moneyFlowHistory, 'holdPercentage'))) {
    await databases.createFloatAttribute(
      config.databaseId,
      config.collections.moneyFlowHistory,
      'holdPercentage',
      true
    )
  }

  if (
    !(await attributeExists(
      config.collections.moneyFlowHistory,
      'eventTimestamp'
    ))
  ) {
    await databases.createDatetimeAttribute(
      config.databaseId,
      config.collections.moneyFlowHistory,
      'eventTimestamp',
      true
    )
  }

  // Relationship to entrants (check if it exists first)
  if (
    !(await attributeExists(config.collections.moneyFlowHistory, 'entrant'))
  ) {
    await databases.createRelationshipAttribute(
      config.databaseId,
      config.collections.moneyFlowHistory,
      config.collections.entrants,
      RelationshipType.ManyToOne,
      false,
      'entrant',
      'moneyFlowHistory'
    )
  }

  // Create indexes (check if they exist first)
  const collection = await databases.getCollection(
    config.databaseId,
    config.collections.moneyFlowHistory
  )

  if (
    !collection.indexes.some(
      (idx: { key: string }) => idx.key === 'idx_timestamp'
    )
  ) {
    const isAvailable = await waitForAttributeAvailable(
      config.collections.moneyFlowHistory,
      'eventTimestamp'
    )
    if (isAvailable) {
      try {
        await databases.createIndex(
          config.databaseId,
          config.collections.moneyFlowHistory,
          'idx_timestamp',
          IndexType.Key,
          ['eventTimestamp']
        )
        log('idx_timestamp index created successfully')
      } catch (error) {
        log(`Failed to create idx_timestamp index: ${error}`, 'error')
      }
    } else {
      log(
        'eventTimestamp attribute is not available for index creation, skipping idx_timestamp index',
        'info'
      )
    }
  }

  log('MoneyFlowHistory collection created successfully', 'success')
}

// Create UserAlertConfigs collection
const createUserAlertConfigsCollection = async () => {
  log('Creating UserAlertConfigs collection...')

  const exists = await resourceExists(() =>
    databases.getCollection(
      config.databaseId,
      config.collections.userAlertConfigs
    )
  )

  if (exists) {
    log('UserAlertConfigs collection already exists, skipping creation', 'info')
  } else {
    await databases.createCollection(
      config.databaseId,
      config.collections.userAlertConfigs,
      'UserAlertConfigs',
      [
        Permission.read(Role.users()),
        Permission.create(Role.users()),
        Permission.update(Role.users()),
        Permission.delete(Role.users()),
      ]
    )
  }

  // Create attributes (check if they exist first)
  if (!(await attributeExists(config.collections.userAlertConfigs, 'userId'))) {
    await databases.createStringAttribute(
      config.databaseId,
      config.collections.userAlertConfigs,
      'userId',
      50,
      true
    )
  }

  if (
    !(await attributeExists(config.collections.userAlertConfigs, 'alertType'))
  ) {
    await databases.createStringAttribute(
      config.databaseId,
      config.collections.userAlertConfigs,
      'alertType',
      50,
      true
    )
  }

  if (
    !(await attributeExists(config.collections.userAlertConfigs, 'threshold'))
  ) {
    await databases.createFloatAttribute(
      config.databaseId,
      config.collections.userAlertConfigs,
      'threshold',
      true
    )
  }

  if (
    !(await attributeExists(config.collections.userAlertConfigs, 'timeWindowSeconds'))
  ) {
    await databases.createIntegerAttribute(
      config.databaseId,
      config.collections.userAlertConfigs,
      'timeWindowSeconds',
      false
    )
  }

  if (
    !(await attributeExists(config.collections.userAlertConfigs, 'enabled'))
  ) {
    await databases.createBooleanAttribute(
      config.databaseId,
      config.collections.userAlertConfigs,
      'enabled',
      true
    )
  }

  // Add relationship to entrants
  if (!(await attributeExists(config.collections.userAlertConfigs, 'entrant'))) {
    await databases.createRelationshipAttribute(
      config.databaseId,
      config.collections.userAlertConfigs,
      config.collections.entrants,
      RelationshipType.ManyToOne,
      false,
      'entrant',
      'alertConfigs'
    )
  }

  // Create indexes (check if they exist first)
  const collection = await databases.getCollection(
    config.databaseId,
    config.collections.userAlertConfigs
  )

  if (
    !collection.indexes.some(
      (idx: { key: string }) => idx.key === 'idx_user_id'
    )
  ) {
    const isAvailable = await waitForAttributeAvailable(
      config.collections.userAlertConfigs,
      'userId'
    )
    if (isAvailable) {
      try {
        await databases.createIndex(
          config.databaseId,
          config.collections.userAlertConfigs,
          'idx_user_id',
          IndexType.Key,
          ['userId']
        )
        log('idx_user_id index created successfully')
      } catch (error) {
        log(`Failed to create idx_user_id index: ${error}`, 'error')
      }
    } else {
      log(
        'userId attribute is not available for index creation, skipping idx_user_id index',
        'error'
      )
    }
  }

  if (
    !collection.indexes.some(
      (idx: { key: string }) => idx.key === 'idx_alert_type'
    )
  ) {
    const isAvailable = await waitForAttributeAvailable(
      config.collections.userAlertConfigs,
      'alertType'
    )
    if (isAvailable) {
      try {
        await databases.createIndex(
          config.databaseId,
          config.collections.userAlertConfigs,
          'idx_alert_type',
          IndexType.Key,
          ['alertType']
        )
        log('idx_alert_type index created successfully')
      } catch (error) {
        log(`Failed to create idx_alert_type index: ${error}`, 'error')
      }
    } else {
      log(
        'alertType attribute is not available for index creation, skipping idx_alert_type index',
        'error'
      )
    }
  }

  log('UserAlertConfigs collection created successfully', 'success')
}

// Create Notifications collection
const createNotificationsCollection = async () => {
  log('Creating Notifications collection...')

  const exists = await resourceExists(() =>
    databases.getCollection(config.databaseId, config.collections.notifications)
  )

  if (exists) {
    log('Notifications collection already exists, skipping creation', 'info')
  } else {
    await databases.createCollection(
      config.databaseId,
      config.collections.notifications,
      'Notifications',
      [
        Permission.read(Role.users()),
        Permission.create(Role.users()),
        Permission.update(Role.users()),
        Permission.delete(Role.users()),
      ]
    )
  }

  // Create attributes (check if they exist first)
  if (!(await attributeExists(config.collections.notifications, 'userId'))) {
    await databases.createStringAttribute(
      config.databaseId,
      config.collections.notifications,
      'userId',
      50,
      true
    )
  }

  if (!(await attributeExists(config.collections.notifications, 'title'))) {
    await databases.createStringAttribute(
      config.databaseId,
      config.collections.notifications,
      'title',
      255,
      true
    )
  }

  if (!(await attributeExists(config.collections.notifications, 'message'))) {
    await databases.createStringAttribute(
      config.databaseId,
      config.collections.notifications,
      'message',
      1000,
      true
    )
  }

  if (!(await attributeExists(config.collections.notifications, 'type'))) {
    await databases.createStringAttribute(
      config.databaseId,
      config.collections.notifications,
      'type',
      50,
      true
    )
  }

  if (!(await attributeExists(config.collections.notifications, 'read'))) {
    await databases.createBooleanAttribute(
      config.databaseId,
      config.collections.notifications,
      'read',
      false
    )
  }

  if (!(await attributeExists(config.collections.notifications, 'raceId'))) {
    await databases.createStringAttribute(
      config.databaseId,
      config.collections.notifications,
      'raceId',
      50,
      false
    )
  }

  if (!(await attributeExists(config.collections.notifications, 'entrantId'))) {
    await databases.createStringAttribute(
      config.databaseId,
      config.collections.notifications,
      'entrantId',
      50,
      false
    )
  }

  // Create indexes (check if they exist first)
  const collection = await databases.getCollection(
    config.databaseId,
    config.collections.notifications
  )

  if (
    !collection.indexes.some(
      (idx: { key: string }) => idx.key === 'idx_user_id'
    )
  ) {
    const isAvailable = await waitForAttributeAvailable(
      config.collections.notifications,
      'userId'
    )
    if (isAvailable) {
      try {
        await databases.createIndex(
          config.databaseId,
          config.collections.notifications,
          'idx_user_id',
          IndexType.Key,
          ['userId']
        )
        log('idx_user_id index created successfully')
      } catch (error) {
        log(`Failed to create idx_user_id index: ${error}`, 'error')
      }
    } else {
      log(
        'userId attribute is not available for index creation, skipping idx_user_id index',
        'error'
      )
    }
  }

  log('Notifications collection created successfully', 'success')
}

// User labels must be created manually in the Appwrite console.
// See instructions in documentation for setting up user role labels.

// Helper function to assign user roles (for use in application code)
const assignUserRole = async (
  userId: string,
  role: 'user' | 'admin' = 'user'
) => {
  const { Users } = await import('node-appwrite')
  const users = new Users(client)

  try {
    // Add the role label to the user
    await users.updateLabels(userId, [role])
    log(`Assigned role "${role}" to user ${userId}`, 'success')
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error'
    log(
      `Failed to assign role "${role}" to user ${userId}: ${errorMessage}`,
      'error'
    )
    throw error
  }
}

// Helper function to get user role (for use in application code)
const getUserRole = async (
  userId: string
): Promise<'user' | 'admin' | null> => {
  const { Users } = await import('node-appwrite')
  const users = new Users(client)

  try {
    const user = await users.get(userId)
    const labels = user.labels || []

    if (labels.includes('admin')) return 'admin'
    if (labels.includes('user')) return 'user'
    return null
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error'
    log(`Failed to get role for user ${userId}: ${errorMessage}`, 'error')
    throw error
  }
}

// Main setup function
const setupAppwrite = async () => {
  try {
    log('🚀 Starting Appwrite setup...')

    // Validate environment variables
    if (!config.projectId || !config.apiKey) {
      throw new Error(
        'Missing required environment variables: APPWRITE_PROJECT_ID and APPWRITE_API_KEY'
      )
    }

    // Create database
    await createDatabase()

    // Create collections
    await createMeetingsCollection()
    await createRacesCollection()
    await createEntrantsCollection()
    await createOddsHistoryCollection()
    await createMoneyFlowHistoryCollection()
    await createUserAlertConfigsCollection()
    await createNotificationsCollection()

    // Note: User labels will be created later as part of actual user creation
    // No need to set them up in this script

    log('🎉 Appwrite setup completed successfully!', 'success')
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error'
    log(`Setup failed: ${errorMessage}`, 'error')
    process.exit(1)
  }
}

// Run setup if called directly
if (require.main === module) {
  setupAppwrite()
}

// Export functions for testing
export { setupAppwrite, config, assignUserRole, getUserRole }
