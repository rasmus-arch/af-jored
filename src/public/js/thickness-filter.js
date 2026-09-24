(function () {
  var materialSelect = document.querySelector('[data-thickness-filter]');
  if (!materialSelect) return;
  var targetId = materialSelect.getAttribute('data-thickness-filter');
  var thicknessSelect = document.getElementById(targetId);
  if (!thicknessSelect) return;

  function update() {
    var options = thicknessSelect.querySelectorAll('option[data-material]');
    options.forEach(function (option) {
      var matches = option.getAttribute('data-material') === materialSelect.value;
      option.hidden = !matches;
      option.disabled = !matches;
    });
    if (thicknessSelect.selectedOptions[0] && thicknessSelect.selectedOptions[0].hidden) {
      thicknessSelect.value = '';
    }
  }

  materialSelect.addEventListener('change', update);
  update();
})();
