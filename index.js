/**
 * 쿠팡 Chrome 자동화 통합 실행 파일
 */

const dbService = require('./lib/services/db-service');
const { parseArgs, printHelp } = require('./lib/utils/cli-parser');
const { runMultiMode } = require('./lib/runners/multi-mode');
const { runApiMode } = require('./lib/runners/api-mode');
const cleanupReports = require('./cleanup-reports');
const UbuntuSetup = require('./lib/utils/ubuntu-setup');

// 메인 실행 함수
async function main() {
  const options = parseArgs();

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  try {
    // Ubuntu 환경에서 종속성 확인 (API 모드에서만, 빠른 확인)
    if (process.platform === 'linux' && options.apiMode) {
      console.log('🐧 Ubuntu 환경 감지 - Chrome 실행 환경 점검 중...');
      const ubuntuCheck = await UbuntuSetup.checkSystemResources();
      if (!ubuntuCheck.success) {
        console.log('⚠️ Ubuntu 환경 설정 문제가 감지되었습니다. 전체 점검을 위해 다음 명령을 실행하세요:');
        console.log('node -e "require(\'./lib/utils/ubuntu-setup\').checkAll()"');
      }
    }
    
    // 자동 리포트 정리 (silent 모드)
    await cleanupReports(true);
    
    let exitCode = 0;
    
    if (options.apiMode) {
      // API 모드 실행
      console.log(`🚀 API 모드 (인스턴스 ${options.instanceNumber}) 실행 시작\n`);
      await runApiMode(options);
    } else {
      // 기존 데이터베이스 모드 실행
      console.log(`🚀 에이전트 '${options.agent}' 실행 시작\n`);
      await runMultiMode(options);
      
      // DB 연결 종료
      await dbService.close();
    }
    
    console.log('\n👋 프로그램 종료');
    process.exit(exitCode);
    
  } catch (error) {
    console.error('\n❌ 프로그램 오류:', error.message);
    
    // DB 연결이 있는 경우에만 종료
    if (!options.apiMode) {
      await dbService.close();
    }
    
    process.exit(1);
  }
}

// 실행
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };