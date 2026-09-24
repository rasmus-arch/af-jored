(function () {
  var decorSelect = document.querySelector('[data-preview-decor]');
  var thicknessSelect = document.querySelector('[data-preview-thickness]');
  if (!decorSelect || !thicknessSelect) return;

  function update() {
    var options = thicknessSelect.querySelectorAll('option[data-decor]');
    options.forEach(function (option) {
      var matches = option.getAttribute('data-decor') === decorSelect.value;
      option.hidden = !matches;
      option.disabled = !matches;
    });
    if (thicknessSelect.selectedOptions[0] && thicknessSelect.selectedOptions[0].hidden) {
      thicknessSelect.value = '';
    }
  }

  decorSelect.addEventListener('change', update);
  update();
})();
