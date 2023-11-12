
export const gui = {
  showHelp: (show=true) => {
    let panel = document.getElementById('help-panel');
    if(show) {
      panel.classList.remove('hidden-right');
    } else {
      panel.classList.add('hidden-right');
    }
  },
  hideHelp: () => { gui.showHelp(false); },

  opentab: (evt) => {
    let target = evt.target;
    if (target && target.id) {
      let tabname = target.id;
      target.classList
      for (let elt of document.querySelectorAll('#main .tabs > span')) {
        elt.classList.remove('active');
      }
      target.classList.add('active');

      let contentId = tabname.substring(4) + 'src';
      for (let elt of document.querySelectorAll('#main .tabcontent > div')) {
        elt.style.display = 'none';
      }
      document.getElementById(contentId).style.display = 'block';
    }
  },

  // Callback on exercise achievement
  displaySuccess: () => {
    const successOverlay = document.getElementById('overlay');
    successOverlay.classList.remove('hidden');
  },

  showLoading: () => {
    document.getElementById('loading').classList.remove('hidden');
  },
  hideLoading: () => {
    document.getElementById('loading').classList.add('hidden');
  },
  // Display login required warning popup
  loginWarning: () => {
    let lr = document.getElementById('login-required');
    lr.style.width = '100%';
    lr.onclick = gui.hideLoginPopup;
    document.getElementById('login-popup').style.transform = 'translate(0,0)';
  },
  hideLoginPopup: () => {
    document.getElementById('login-popup').style.transform = 'translate(0,-70vh)';
    document.getElementById('login-required').style.width = '0%';
  },

  toggleMenu: (evt) => {
    let eltMenu = document.getElementById('profileMenu');
    if(eltMenu.classList.contains('hidden')){
      eltMenu.classList.remove('hidden');
      document.addEventListener('click', gui.toggleMenu);
    } else {
      eltMenu.classList.add('hidden');
      document.removeEventListener('click', gui.toggleMenu);
    }
    evt.stopPropagation();
  },
}