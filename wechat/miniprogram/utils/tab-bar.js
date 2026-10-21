// Called on each tab page show, including returns from editor and login.
function syncTabBar(page) {
  if (typeof page.getTabBar !== 'function') return
  const bar = page.getTabBar()
  if (bar && bar.sync) bar.sync(page.route)
}
function setTabBarHidden(page, hidden) {
  const bar = typeof page.getTabBar === 'function' && page.getTabBar()
  if (bar && typeof bar.setData === 'function') {
    if (hidden && typeof bar.cancelMenu === 'function') bar.cancelMenu()
    bar.setData({ hidden })
  }
  // This app always uses custom tabBar. During navigation its instance may
  // be detached; native showTabBar would enable a second system bar.
  // The custom component restores visibility from page state on attachment.
}
module.exports = { syncTabBar, setTabBarHidden }
