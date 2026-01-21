/**
 * 测试采集API端点
 */
import http from 'http';

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

function makeRequest(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port || 3000,
      path: url.pathname,
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

async function testAPIs() {
  console.log('=== 测试采集API端点 ===\n');
  console.log(`测试地址: ${BASE_URL}\n`);

  // 1. 测试采集器状态
  console.log('1. 测试 GET /api/collect/status');
  try {
    const statusRes = await makeRequest('/api/collect/status');
    console.log(`   状态码: ${statusRes.status}`);
    console.log(`   响应:`, JSON.stringify(statusRes.data, null, 2));
  } catch (error) {
    console.error(`   ✗ 失败:`, error.message);
  }
  console.log('');

  // 2. 测试测试采集端点
  console.log('2. 测试 GET /api/collect/test');
  try {
    const testRes = await makeRequest('/api/collect/test');
    console.log(`   状态码: ${testRes.status}`);
    console.log(`   响应:`, JSON.stringify(testRes.data, null, 2));
  } catch (error) {
    console.error(`   ✗ 失败:`, error.message);
  }
  console.log('');

  // 3. 测试采集记录
  console.log('3. 测试 GET /api/collections');
  try {
    const collectionsRes = await makeRequest('/api/collections');
    console.log(`   状态码: ${collectionsRes.status}`);
    if (collectionsRes.data.success) {
      console.log(`   总记录数: ${collectionsRes.data.summary.total}`);
      console.log(`   成功: ${collectionsRes.data.summary.success}`);
      console.log(`   失败: ${collectionsRes.data.summary.failed}`);
      console.log(`   采集案例数: ${collectionsRes.data.summary.totalCollected}`);
    } else {
      console.log(`   响应:`, JSON.stringify(collectionsRes.data, null, 2));
    }
  } catch (error) {
    console.error(`   ✗ 失败:`, error.message);
  }
  console.log('');

  // 4. 测试定时任务状态
  console.log('4. 测试 GET /api/cron/status');
  try {
    const cronRes = await makeRequest('/api/cron/status');
    console.log(`   状态码: ${cronRes.status}`);
    console.log(`   响应:`, JSON.stringify(cronRes.data, null, 2));
  } catch (error) {
    console.error(`   ✗ 失败:`, error.message);
  }
  console.log('');

  console.log('=== API测试完成 ===');
}

testAPIs().catch(console.error);
