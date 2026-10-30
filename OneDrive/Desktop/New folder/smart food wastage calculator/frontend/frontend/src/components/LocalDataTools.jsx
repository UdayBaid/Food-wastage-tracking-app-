import { useState } from 'react'
import { Archive, CheckCircle2, Database, Download, FileUp, LoaderCircle, MapPin, ShieldCheck } from 'lucide-react'
import { getApiError, getData } from '../hooks/useApiData'
import api from '../services/api'
import { useApiData } from '../hooks/useApiData'
import Panel from './Panel'

export default function LocalDataTools() {
  const { data: info, loading, error, refresh } = useApiData(() => getData('/database/info'), [])
  const [backupBusy, setBackupBusy] = useState(false)
  const [restoreBusy, setRestoreBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [failure, setFailure] = useState('')

  const downloadBackup = async () => {
    setBackupBusy(true)
    setMessage('')
    setFailure('')
    try {
      const response = await api.get('/database/backup', { responseType: 'blob' })
      const objectUrl = URL.createObjectURL(response.data)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = response.headers['content-disposition']?.match(/filename="?([^";]+)"?/)?.[1] || 'foodwise-backup.db'
      anchor.click()
      URL.revokeObjectURL(objectUrl)
      setMessage('SQLite backup downloaded to your browser downloads folder.')
      refresh()
    } catch (requestError) {
      setFailure(getApiError(requestError))
    } finally {
      setBackupBusy(false)
    }
  }

  const restoreBackup = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!window.confirm(`Restore ${file.name}? This replaces the current local database. A safety backup will be created first.`)) return

    setRestoreBusy(true)
    setMessage('')
    setFailure('')
    try {
      const response = await api.post('/database/restore?confirm_overwrite=true', await file.arrayBuffer(), {
        headers: { 'Content-Type': 'application/vnd.sqlite3' },
        timeout: 60000,
      })
      setMessage(`Database restored. Previous data safety copy: ${response.data.safety_backup_path}`)
      refresh()
    } catch (requestError) {
      setFailure(getApiError(requestError))
    } finally {
      setRestoreBusy(false)
    }
  }

  return <Panel title={<><Database size={18} /> Local data & backup</>} subtitle="FoodWise stores records and model history in a local SQLite database. No cloud storage is used.">
    {loading && <div className="local-data-status"><LoaderCircle className="spin" size={16} /> Checking local storage</div>}
    {error && <div className="form-message form-message-error" role="alert">{error}</div>}
    {info && <div className="local-storage-details">
      <div className="storage-detail"><span><MapPin size={16} /> Database location</span><code>{info.database_path}</code></div>
      <div className="storage-detail"><span><Archive size={16} /> Backup folder</span><code>{info.backup_directory}</code></div>
      <div className="storage-detail"><span><Database size={16} /> Current database</span><strong>{info.database_exists ? `${(info.database_size_bytes / 1024).toFixed(0)} KB · available` : 'Not created yet'}</strong></div>
    </div>}
    <div className="local-data-actions">
      <button className="button button-primary" onClick={downloadBackup} disabled={backupBusy || !info?.database_exists}>{backupBusy ? <LoaderCircle className="spin" size={16} /> : <Download size={16} />}{backupBusy ? 'Preparing backup…' : 'Download database backup'}</button>
      <label className={`button button-light upload-button ${restoreBusy ? 'button-disabled' : ''}`}><FileUp size={16} />{restoreBusy ? 'Validating backup…' : 'Restore from backup'}<input type="file" accept=".db,.sqlite,.sqlite3,application/vnd.sqlite3,application/octet-stream" onChange={restoreBackup} disabled={restoreBusy} /></label>
    </div>
    <div className="backup-safety-note"><ShieldCheck size={16} /><span>Restore checks SQLite integrity and FoodWise tables before replacing data, asks for confirmation, and automatically creates a safety backup first. Maximum upload: 100 MB.</span></div>
    {message && <div className="form-message form-message-success" role="status"><CheckCircle2 size={17} />{message}</div>}
    {failure && <div className="form-message form-message-error" role="alert">{failure}</div>}
  </Panel>
}
