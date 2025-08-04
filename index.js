/**
 * 쿠팡 Chrome 자동화 통합 실행 파일
 */

const dbService = require('./lib/services/db-service');
const { parseArgs, printHelp } = require('./lib/utils/cli-parser');
const { runIdMode } = require('./lib/runners/id-mode');
const { runMultiMode } = require('./lib/runners/multi-mode');

// 메인 실행 함수
async function main() {
  const options = parseArgs();

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  try {
    let exitCode = 0;
    
    // ID 모드가 최우선
    if (options.id) {
      exitCode = await runIdMode(options.id, options);
    } else {
      // 기본: agent의 모든 키워드 실행
      console.log(`🚀 에이전트 '${options.agent}' 실행 시작\n`);
      await runMultiMode(options);
    }
    
    // DB 연결 종료
    await dbService.close();
    
    console.log('\n👋 프로그램 종료');
    process.exit(exitCode);
    
  } catch (error) {
    console.error('\n❌ 프로그램 오류:', error.message);
    await dbService.close();
    process.exit(1);
  }
}

// 실행
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };