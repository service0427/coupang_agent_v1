/**
 * 브라우저 관리 서비스
 * - 브라우저 인스턴스 생명주기 관리
 * - 브라우저 풀링 및 재사용
 * - 메모리 최적화
 */

const { launchChrome } = require('../core/chrome-launcher');

class BrowserManager {
  constructor() {
    this.activeBrowsers = new Map(); // profileName -> browser 매핑
    this.browserStats = {
      created: 0,
      closed: 0,
      reused: 0,
      active: 0
    };
  }

  /**
   * 브라우저 인스턴스 생성 또는 재사용
   * @param {Object} options - 브라우저 옵션
   * @returns {Object} 브라우저 정보
   */
  async getBrowser(options = {}) {
    const {
      proxyConfig = null,
      usePersistent = true,
      profileName = 'default',
      clearSession = false,
      clearCache = false,
      headless = false,
      gpuDisabled = false,
      windowPosition = null,
      trafficMonitor = true  // V2: 항상 네트워크 모니터링 활성화
    } = options;

    const browserKey = this.generateBrowserKey(options);
    
    // 캐시 최적화: Chrome 프로세스 정리 후 프로필 재사용
    if (usePersistent && !clearSession && !clearCache) {
      const actualUserDataDir = options.userDataDir || `browser-data/${profileName}`;
      
      console.log(`💾 [캐시 최적화] 영구 프로필 모드: ${browserKey}`);
      console.log(`   - 실제 프로필 디렉토리: ${actualUserDataDir}`);
      console.log(`   - Chrome 프로세스 정리 후 프로필 재사용`);
      
      // 특정 프로필의 Chrome 프로세스만 정리로 락 해제
      await this.killSpecificChromeProcesses(actualUserDataDir);
    }
    
    // 기존 브라우저 재사용 확인 (메모리 내 활성 브라우저만)
    if (this.activeBrowsers.has(browserKey) && !clearSession && !clearCache) {
      const existingBrowser = this.activeBrowsers.get(browserKey);
      
      if (await this.isBrowserAlive(existingBrowser.browser)) {
        console.log(`🔄 [브라우저 관리] 기존 브라우저 재사용: ${browserKey}`);
        this.browserStats.reused++;
        return existingBrowser;
      } else {
        // 죽은 브라우저 정리
        this.activeBrowsers.delete(browserKey);
        this.browserStats.active--;
      }
    }

    // 새로운 브라우저 생성 (프로필 재사용으로 캐시 효과 기대)
    console.log(`🚀 [브라우저 관리] 새 브라우저 생성: ${browserKey}`);
    
    const browserInfo = await launchChrome(
      proxyConfig,
      usePersistent,
      profileName,
      clearSession,
      clearCache,
      headless,
      gpuDisabled,
      windowPosition,
      trafficMonitor,
      options.userDataDir  // userDataDir 전달 추가
    );

    // 브라우저 정보 저장
    const managedBrowserInfo = {
      ...browserInfo,
      createdAt: new Date(),
      lastUsed: new Date(),
      profileName,
      options
    };

    this.activeBrowsers.set(browserKey, managedBrowserInfo);
    this.browserStats.created++;
    this.browserStats.active++;

    return managedBrowserInfo;
  }

  /**
   * 브라우저 키 생성
   * @param {Object} options - 브라우저 옵션
   * @returns {string} 브라우저 키
   */
  generateBrowserKey(options) {
    const {
      proxyConfig,
      profileName = 'default',
      gpuDisabled = false,
      headless = false
    } = options;

    const proxyKey = proxyConfig ? proxyConfig.server : 'no-proxy';
    return `${profileName}_${proxyKey}_${gpuDisabled ? 'gpu-off' : 'gpu-on'}_${headless ? 'headless' : 'headed'}`;
  }

  /**
   * 브라우저 생존 확인
   * @param {Object} browser - 브라우저 인스턴스
   * @returns {boolean} 생존 여부
   */
  async isBrowserAlive(browser) {
    try {
      if (!browser || !browser.isConnected()) {
        return false;
      }
      
      // 페이지 목록 확인으로 브라우저 상태 검증
      const pages = await browser.pages();
      return pages.length >= 0; // 페이지가 0개 이상이면 정상
    } catch (error) {
      return false;
    }
  }

  /**
   * 특정 브라우저 종료
   * @param {string} browserKey - 브라우저 키
   */
  async closeBrowser(browserKey) {
    if (!this.activeBrowsers.has(browserKey)) {
      return;
    }

    const browserInfo = this.activeBrowsers.get(browserKey);
    
    try {
      if (await this.isBrowserAlive(browserInfo.browser)) {
        await browserInfo.browser.close();
        console.log(`🔽 [브라우저 관리] 브라우저 종료: ${browserKey}`);
      }
    } catch (error) {
      console.error(`❌ [브라우저 관리] 브라우저 종료 실패 (${browserKey}):`, error.message);
    } finally {
      this.activeBrowsers.delete(browserKey);
      this.browserStats.closed++;
      this.browserStats.active--;
    }
  }

  /**
   * 모든 브라우저 종료
   */
  async closeAllBrowsers() {
    console.log(`🔽 [브라우저 관리] 모든 브라우저 종료 시작 (${this.activeBrowsers.size}개)`);
    
    const closePromises = [];
    for (const [browserKey, browserInfo] of this.activeBrowsers.entries()) {
      closePromises.push(this.closeBrowser(browserKey));
    }

    await Promise.allSettled(closePromises);
    
    console.log(`✅ [브라우저 관리] 모든 브라우저 종료 완료`);
  }

  /**
   * 유휴 브라우저 정리 (5분 이상 사용하지 않은 브라우저)
   * @param {number} maxIdleTime - 최대 유휴 시간 (밀리초, 기본: 5분)
   */
  async cleanupIdleBrowsers(maxIdleTime = 5 * 60 * 1000) {
    const now = new Date();
    const idleBrowsers = [];

    for (const [browserKey, browserInfo] of this.activeBrowsers.entries()) {
      const idleTime = now - browserInfo.lastUsed;
      if (idleTime > maxIdleTime) {
        idleBrowsers.push(browserKey);
      }
    }

    if (idleBrowsers.length > 0) {
      console.log(`🧹 [브라우저 관리] 유휴 브라우저 정리: ${idleBrowsers.length}개`);
      
      for (const browserKey of idleBrowsers) {
        await this.closeBrowser(browserKey);
      }
    }
  }

  /**
   * 브라우저 사용 시간 업데이트
   * @param {string} browserKey - 브라우저 키
   */
  updateLastUsed(browserKey) {
    if (this.activeBrowsers.has(browserKey)) {
      this.activeBrowsers.get(browserKey).lastUsed = new Date();
    }
  }

  /**
   * 브라우저 통계 조회
   * @returns {Object} 브라우저 통계
   */
  getStats() {
    return {
      ...this.browserStats,
      activeBrowserKeys: Array.from(this.activeBrowsers.keys())
    };
  }

  /**
   * 브라우저 목록 조회
   * @returns {Array} 브라우저 정보 목록
   */
  getBrowserList() {
    const browsers = [];
    
    for (const [browserKey, browserInfo] of this.activeBrowsers.entries()) {
      browsers.push({
        key: browserKey,
        profileName: browserInfo.profileName,
        createdAt: browserInfo.createdAt,
        lastUsed: browserInfo.lastUsed,
        proxy: browserInfo.options.proxyConfig?.server || null,
        isAlive: this.isBrowserAlive(browserInfo.browser)
      });
    }

    return browsers;
  }

  /**
   * 메모리 사용량 최적화
   * - 죽은 브라우저 정리
   * - 유휴 브라우저 정리
   */
  async optimizeMemory() {
    console.log('🧹 [브라우저 관리] 메모리 최적화 시작');
    
    // 죽은 브라우저 정리
    const deadBrowsers = [];
    for (const [browserKey, browserInfo] of this.activeBrowsers.entries()) {
      if (!(await this.isBrowserAlive(browserInfo.browser))) {
        deadBrowsers.push(browserKey);
      }
    }

    for (const browserKey of deadBrowsers) {
      this.activeBrowsers.delete(browserKey);
      this.browserStats.active--;
      console.log(`💀 [브라우저 관리] 죽은 브라우저 정리: ${browserKey}`);
    }

    // 유휴 브라우저 정리
    await this.cleanupIdleBrowsers();

    console.log(`✅ [브라우저 관리] 메모리 최적화 완료 (활성: ${this.browserStats.active}개)`);
  }

  /**
   * 특정 유저 데이터 디렉토리를 사용하는 Chrome 프로세스만 선택적으로 종료
   */
  async killSpecificChromeProcesses(userDataDir) {
    const os = require('os');
    const { exec } = require('child_process');
    const util = require('util');
    const execAsync = util.promisify(exec);
    const path = require('path');
    
    try {
      // 유저 데이터 디렉토리 절대 경로 구하기
      const absolutePath = path.resolve(userDataDir);
      
      if (os.platform() === 'win32') {
        // Windows에서 특정 유저 데이터 디렉토리를 사용하는 Chrome만 찾아서 종료
        try {
          const { stdout } = await execAsync(`wmic process where "name='chrome.exe' and commandline like '%${absolutePath.replace(/\\/g, '\\\\')}%'" get processid /format:value`, 
            { windowsHide: true });
          
          const pids = stdout.match(/ProcessId=(\d+)/g);
          if (pids && pids.length > 0) {
            for (const pidMatch of pids) {
              const pid = pidMatch.split('=')[1];
              if (pid && pid !== '0') {
                await execAsync(`taskkill /F /PID ${pid} 2>NUL`, { windowsHide: true }).catch(() => {});
              }
            }
            console.log(`   ✅ 자동화용 Chrome 프로세스 정리 완료 (${pids.length}개)`);
          } else {
            console.log(`   ℹ️ 정리할 자동화용 Chrome 프로세스 없음`);
          }
        } catch (error) {
          // wmic 실패 시 폴백: 모든 Chrome 확인하고 경로 매칭
          console.warn(`   ⚠️ wmic 사용 실패, 폴백 방식 사용`);
          await this.killChromeProcessesFallback(absolutePath);
        }
      } else if (os.platform() === 'linux') {
        // Ubuntu/Linux에서 특정 유저 데이터 디렉토리를 사용하는 Chrome만 종료
        await execAsync(`pkill -f "chrome.*${absolutePath}" 2>/dev/null || true`);
        await execAsync(`pkill -f "chromium.*${absolutePath}" 2>/dev/null || true`);
        console.log(`   ✅ 자동화용 Chrome 프로세스 정리 완료`);
      } else {
        // macOS (Rocky Linux도 비슷)
        await execAsync(`pkill -f "Chrome.*${absolutePath}" 2>/dev/null || true`);
        await execAsync(`pkill -f "Chromium.*${absolutePath}" 2>/dev/null || true`);
        console.log(`   ✅ 자동화용 Chrome 프로세스 정리 완료`);
      }
      
      // 프로세스 종료 대기
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      console.warn(`   ⚠️ Chrome 프로세스 정리 중 오류: ${error.message}`);
    }
  }

  /**
   * Windows 폴백: tasklist로 Chrome 프로세스 확인 후 경로 매칭하여 종료
   */
  async killChromeProcessesFallback(targetPath) {
    const { exec } = require('child_process');
    const util = require('util');
    const execAsync = util.promisify(exec);
    
    try {
      // tasklist로 Chrome 프로세스들의 PID와 명령줄 가져오기
      const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq chrome.exe" /FO CSV', { windowsHide: true });
      const lines = stdout.split('\n').slice(1); // 헤더 제외
      
      let killedCount = 0;
      for (const line of lines) {
        if (line.trim()) {
          const parts = line.split(',');
          if (parts.length >= 2) {
            const pid = parts[1].replace(/"/g, '').trim();
            if (pid && pid !== '0') {
              // 해당 PID의 명령줄 인자 확인
              try {
                const { stdout: cmdline } = await execAsync(`wmic process where "processid='${pid}'" get commandline /format:value`, 
                  { windowsHide: true });
                
                if (cmdline.includes(targetPath)) {
                  await execAsync(`taskkill /F /PID ${pid} 2>NUL`, { windowsHide: true }).catch(() => {});
                  killedCount++;
                }
              } catch (e) {
                // 개별 프로세스 확인 실패는 무시
              }
            }
          }
        }
      }
      
      if (killedCount > 0) {
        console.log(`   ✅ 자동화용 Chrome 프로세스 정리 완료 (${killedCount}개)`);
      } else {
        console.log(`   ℹ️ 정리할 자동화용 Chrome 프로세스 없음`);
      }
    } catch (error) {
      console.warn(`   ⚠️ 폴백 방식도 실패: ${error.message}`);
    }
  }

  /**
   * 레거시: 모든 Chrome 프로세스 종료 (하위 호환성용)
   */
  async killChromeProcesses() {
    console.warn('⚠️ killChromeProcesses() 사용 중 - killSpecificChromeProcesses() 사용 권장');
    
    const os = require('os');
    const { exec } = require('child_process');
    const util = require('util');
    const execAsync = util.promisify(exec);
    
    try {
      if (os.platform() === 'win32') {
        // Windows에서 Chrome 프로세스 정리
        await execAsync('taskkill /F /IM chrome.exe /T 2>NUL', { windowsHide: true }).catch(() => {});
        await execAsync('taskkill /F /IM chromium.exe /T 2>NUL', { windowsHide: true }).catch(() => {});
        console.log(`   ✅ Chrome 프로세스 정리 완료`);
      } else {
        // Linux/Mac에서 Chrome 프로세스 정리
        await execAsync('pkill -f "chrome|chromium" 2>/dev/null || true').catch(() => {});
        console.log(`   ✅ Chrome 프로세스 정리 완료`);
      }
      
      // 프로세스 종료 대기
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.log(`   ⚠️ Chrome 프로세스 정리 중 오류 (무시됨): ${error.message}`);
    }
  }

  /**
   * 프로세스 종료 시 정리 작업
   */
  async shutdown() {
    console.log('🛑 [브라우저 관리] 서비스 종료 중...');
    await this.closeAllBrowsers();
    
    // Chrome 프로세스 완전 정리
    await this.killChromeProcesses();
    
    const stats = this.getStats();
    console.log('📊 [브라우저 관리] 최종 통계:', stats);
  }
}

// 싱글톤 인스턴스
const browserManager = new BrowserManager();

// 프로세스 종료 시 정리
process.on('SIGINT', async () => {
  await browserManager.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await browserManager.shutdown();
  process.exit(0);
});

module.exports = browserManager;