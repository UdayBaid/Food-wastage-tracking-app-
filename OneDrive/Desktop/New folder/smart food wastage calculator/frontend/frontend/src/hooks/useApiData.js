import { useCallback, useEffect, useRef, useState } from 'react'
import { getApiError, getData } from '../services/api'

export function useApiData(loader, dependencies = []) {
  const [state, setState] = useState({ data: null, requestKey: '', error: '' })
  const [version, setVersion] = useState(0)
  const loaderRef = useRef(loader)
  const dependencyKey = JSON.stringify(dependencies)
  const requestKey = `${dependencyKey}:${version}`

  const refresh = useCallback(() => setVersion((current) => current + 1), [])

  useEffect(() => { loaderRef.current = loader }, [loader])

  useEffect(() => {
    let active = true
    loaderRef.current()
      .then((data) => {
        if (active) setState({ data, requestKey, error: '' })
      })
      .catch((error) => {
        if (active) setState((current) => ({ ...current, requestKey, error: getApiError(error) }))
      })

    return () => { active = false }
  }, [dependencyKey, requestKey])

  return {
    ...state,
    loading: state.requestKey !== requestKey,
    error: state.requestKey === requestKey ? state.error : '',
    refresh,
  }
}

export { getApiError, getData }