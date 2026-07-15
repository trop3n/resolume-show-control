import { join } from 'node:path'
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { ResolumeClient } from './resolume-client'
import {
  listSongs,
  saveSong,
  loadSong,
  deleteSong,
  readAudio,
  openAudioDialog,
  type SavedShow
} from './songbank'

let win: BrowserWindow | null = null
let client: ResolumeClient | null = null

function createWindow(): void {
  win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#050506',
    show: false,
    autoHideMenuBar: true,
    title: 'Resolume Show Control',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  win.on('ready-to-show', () => win?.show())
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) win.loadURL(devUrl)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

function wireResolume(host: string): ResolumeClient {
  client?.disconnect()
  client = new ResolumeClient(host)
  client.on('state', (model) => win?.webContents.send('resolume:state', model))
  client.on('status', (s) => win?.webContents.send('resolume:status', s))
  client.connectWs()
  return client
}

app.whenReady().then(() => {
  // Connect: start the live mirror, and return a reliable REST snapshot for first paint.
  ipcMain.handle('resolume:connect', async (_e, host: string) => {
    const c = wireResolume(host)
    return c.getComposition()
  })
  ipcMain.handle('resolume:getComposition', async () => (client ? client.getComposition() : null))
  ipcMain.handle('resolume:fireClip', async (_e, layer: number, clip: number) => {
    client?.fireClip(layer, clip)
    return true
  })
  ipcMain.handle('resolume:fireColumn', async (_e, column: number) => {
    client?.fireColumn(column)
    return true
  })
  ipcMain.handle('resolume:disconnectAll', async () => {
    client?.disconnectAll()
    return true
  })

  // Song bank + audio persistence
  ipcMain.handle('bank:list', async () => listSongs())
  ipcMain.handle('bank:save', async (_e, show: SavedShow, id?: string) => saveSong(show, id))
  ipcMain.handle('bank:load', async (_e, id: string) => loadSong(id))
  ipcMain.handle('bank:delete', async (_e, id: string) => deleteSong(id))
  ipcMain.handle('bank:readAudio', async (_e, path: string) => readAudio(path))
  ipcMain.handle('bank:openAudio', async () => openAudioDialog(win))

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  client?.disconnect()
  if (process.platform !== 'darwin') app.quit()
})
