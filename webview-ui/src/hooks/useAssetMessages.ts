/**
 * Original addition by Sergey Gridchin, 2026.
 * Licensed under the Sergey Source-Available Noncommercial License 1.0.
 * See LICENSE-SERGEY-ADDITIONS and NOTICE.
 */

import { useState } from 'react'
import type { FurnitureAsset, WorkspaceFolder, GithubTasksConfig } from './useExtensionMessages.js'
import { setFloorSprites } from '../office/floorTiles.js'
import { setWallSprites } from '../office/wallTiles.js'
import { setCharacterTemplates } from '../office/sprites/spriteData.js'
import { buildDynamicCatalog } from '../office/layout/furnitureCatalog.js'
import { setSoundEnabled, setDesktopNotificationsEnabled } from '../notificationSound.js'

export interface AssetMessagesState {
  loadedAssets: { catalog: FurnitureAsset[]; sprites: Record<string, string[][]> } | undefined
  workspaceFolders: WorkspaceFolder[]
  externalAssetDirectories: string[]
  characterPackDirectory: string
  enabledCharacterIndexes: number[]
  githubTasks: GithubTasksConfig
  serverMode: string
  setLoadedAssets: React.Dispatch<React.SetStateAction<{ catalog: FurnitureAsset[]; sprites: Record<string, string[][]> } | undefined>>
  setWorkspaceFolders: React.Dispatch<React.SetStateAction<WorkspaceFolder[]>>
  setExternalAssetDirectories: React.Dispatch<React.SetStateAction<string[]>>
  setCharacterPackDirectory: React.Dispatch<React.SetStateAction<string>>
  setEnabledCharacterIndexes: React.Dispatch<React.SetStateAction<number[]>>
  setGithubTasks: React.Dispatch<React.SetStateAction<GithubTasksConfig>>
  setServerMode: React.Dispatch<React.SetStateAction<string>>
}

/**
 * Manages asset loading state: sprites, tiles, furniture, workspace folders, settings.
 */
export function useAssetMessages(): AssetMessagesState {
  const [loadedAssets, setLoadedAssets] = useState<{ catalog: FurnitureAsset[]; sprites: Record<string, string[][]> } | undefined>()
  const [workspaceFolders, setWorkspaceFolders] = useState<WorkspaceFolder[]>([])
  const [externalAssetDirectories, setExternalAssetDirectories] = useState<string[]>([])
  const [characterPackDirectory, setCharacterPackDirectory] = useState('')
  const [enabledCharacterIndexes, setEnabledCharacterIndexes] = useState<number[]>([0, 1, 2, 3, 4, 5])
  const [githubTasks, setGithubTasks] = useState<GithubTasksConfig>({
    enabled: true,
    maxIssues: 30,
    pipeline: {
      enabled: false,
      states: [],
      gates: [],
    },
  })
  const [serverMode, setServerMode] = useState<string>('...')

  return {
    loadedAssets,
    workspaceFolders,
    externalAssetDirectories,
    characterPackDirectory,
    enabledCharacterIndexes,
    githubTasks,
    serverMode,
    setLoadedAssets,
    setWorkspaceFolders,
    setExternalAssetDirectories,
    setCharacterPackDirectory,
    setEnabledCharacterIndexes,
    setGithubTasks,
    setServerMode,
  }
}

/**
 * Handles a single message event for asset/config loading types.
 * Returns true if the message was handled, false otherwise.
 */
export function handleAssetMessage(
  msg: Record<string, unknown>,
  state: AssetMessagesState,
): boolean {
  const {
    setLoadedAssets,
    setWorkspaceFolders,
    setExternalAssetDirectories,
    setCharacterPackDirectory,
    setEnabledCharacterIndexes,
    setGithubTasks,
    setServerMode,
  } = state

  if (msg.type === 'characterSpritesLoaded') {
    const characters = msg.characters as Array<{ down: string[][][]; up: string[][][]; right: string[][][] }>
    console.log(`[Webview] Received ${characters.length} pre-colored character sprites`)
    setCharacterTemplates(characters)
    return true
  } else if (msg.type === 'floorTilesLoaded') {
    const sprites = msg.sprites as string[][][]
    console.log(`[Webview] Received ${sprites.length} floor tile patterns`)
    setFloorSprites(sprites)
    return true
  } else if (msg.type === 'wallTilesLoaded') {
    const sets = msg.sets as string[][][][]
    console.log(`[Webview] Received ${sets.length} wall tile set(s)`)
    setWallSprites(sets)
    return true
  } else if (msg.type === 'workspaceFolders') {
    const folders = msg.folders as WorkspaceFolder[]
    setWorkspaceFolders(folders)
    return true
  } else if (msg.type === 'settingsLoaded') {
    const soundOn = msg.soundEnabled as boolean
    setSoundEnabled(soundOn)
    if (msg.desktopNotifications !== undefined) {
      setDesktopNotificationsEnabled(msg.desktopNotifications as boolean)
    }
    if (Array.isArray(msg.externalAssetDirectories)) {
      setExternalAssetDirectories(msg.externalAssetDirectories as string[])
    }
    if (typeof msg.characterPackDirectory === 'string') {
      setCharacterPackDirectory(msg.characterPackDirectory)
    }
    if (Array.isArray(msg.enabledCharacterIndexes)) {
      setEnabledCharacterIndexes(msg.enabledCharacterIndexes.filter((index): index is number => typeof index === 'number'))
    }
    if (msg.githubTasks) {
      setGithubTasks(msg.githubTasks as GithubTasksConfig)
    }
    if (msg.serverMode) {
      setServerMode(msg.serverMode as string)
    }
    return true
  } else if (msg.type === 'externalAssetDirectoriesUpdated') {
    if (Array.isArray(msg.dirs)) {
      setExternalAssetDirectories(msg.dirs as string[])
    }
    return true
  } else if (msg.type === 'furnitureAssetsLoaded') {
    try {
      const catalog = msg.catalog as FurnitureAsset[]
      const sprites = msg.sprites as Record<string, string[][]>
      console.log(`[Webview] Loaded ${catalog.length} furniture assets`)
      buildDynamicCatalog({ catalog, sprites })
      setLoadedAssets({ catalog, sprites })
    } catch (err) {
      console.error(`[Webview] Error processing furnitureAssetsLoaded:`, err)
    }
    return true
  }

  return false
}
