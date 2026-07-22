// 온실가스 관리기사 학습 플랫폼 전용 서비스워커.
// (다른 프로젝트의 언어학습 게임용 service-worker.js와는 별개 파일입니다 — 캐시 이름도
// 겹치지 않도록 별도로 지정했습니다.)
//
// 전략: network-first, 오프라인일 때만 캐시로 대체.
// (온라인 상태에서는 항상 최신 index.html/ghg_config.js를 받아오고, 네트워크가 없을 때만
// 마지막으로 받아둔 캐시를 대신 보여준다 — cache-first로 하면 새 버전을 배포해도 한동안
// 옛날 화면이 그대로 보이는 문제가 생기므로 이 방식을 씀.)

const CACHE_NAME = 'ghg-platform-v1';

// 최초 설치 시 미리 캐싱해둘 핵심 파일들 — 이 목록에 있는 파일들은 완전히 오프라인인
// 상태(예: 비행기 모드)에서 앱을 새로 열어도(탭을 닫았다 다시 열어도) 화면이 뜨도록 해준다.
// (이 최초 설치 자체는 최소 한 번은 온라인 상태에서 이뤄져야 합니다.)
const CORE_ASSETS = [
  './',
  './index.html',
  './ghg_config.js',
  './xlsx.full.min.js',
  './manifest.json',
  './icon192.png',
  './icon512.png',
  './appletouchicon.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) {
        // addAll은 하나라도 실패하면 전체가 실패하므로, 개별로 넣어서 하나(예: 폰트 CDN
        // 관련 이슈)가 실패해도 나머지 핵심 파일은 확실히 캐싱되게 한다.
        return Promise.all(
          CORE_ASSETS.map(function (url) {
            return fetch(url).then(function (res) {
              if (res && res.ok) return cache.put(url, res);
            }).catch(function () { /* 무시 — 실제 방문 시 다시 캐싱 시도됨 */ });
          })
        );
      })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (names) {
        return Promise.all(
          names.filter(function (n) { return n !== CACHE_NAME; })
               .map(function (n) { return caches.delete(n); })
        );
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  // 클라우드 동기화(Apps Script) 요청은 이 서비스워커가 절대 가로채면 안 된다 — 캐싱되면
  // "서버 최신 응답"이 아니라 예전 응답을 계속 보게 되는, 그동안 겪었던 문제가 재발할 수 있다.
  if (event.request.url.indexOf('script.google.com') !== -1) return;
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request).then(function (response) {
      if (response && response.status === 200) {
        var copy = response.clone();
        event.waitUntil(
          caches.open(CACHE_NAME).then(function (cache) { return cache.put(event.request, copy); })
        );
      }
      return response;
    }).catch(function () {
      // 오프라인(또는 요청 실패): 마지막으로 캐싱해둔 응답이 있으면 그걸 대신 보여준다.
      return caches.match(event.request).then(function (cached) {
        if (cached) return cached;
        // 이 요청에 대한 캐시가 없고, 페이지 자체를 열려는 시도라면(예: 탭을 새로 열었는데
        // 오프라인) 최소한 앱 화면(index.html)이라도 뜨게 한다.
        if (event.request.mode === 'navigate') return caches.match('./index.html');
        return undefined;
      });
    })
  );
});
