import { resetStorageCaches } from './core'
import { sessionApi } from './session'
import { distributeApi } from './distribute'
import { storeSourcesApi } from './store-sources'
import { platformsApi } from './platforms'
import { settingsApi } from './settings'
import { skillsApi } from './skills'
import { githubCacheApi } from './github-cache'
import { webCacheApi } from './web-cache'
import { projectsApi } from './projects'
import { pageStateApi } from './page-state'
import { translationsApi } from './translations'
import { failuresApi } from './failures'
import { userIconsApi } from './user-icons'

export { resetStorageCaches } from './core'
export type { SessionDownload } from './core'

/** Facade: same public API as former monolithic storage.ts */
export const storage = {
  ...sessionApi,
  ...distributeApi,
  ...storeSourcesApi,
  ...platformsApi,
  ...settingsApi,
  ...skillsApi,
  ...githubCacheApi,
  ...webCacheApi,
  ...projectsApi,
  ...pageStateApi,
  ...translationsApi,
  ...failuresApi,
  ...userIconsApi,
}

// ensure tree-shaking doesn't drop reset when only storage imported via side effect tests
void resetStorageCaches
