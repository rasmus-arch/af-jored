(function () {
  var select = document.querySelector('[data-toggle-companies]');
  var fieldset = document.querySelector('[data-companies-fieldset]');
  if (!select || !fieldset) return;

  function update() {
    fieldset.hidden = select.value !== 'SPECIFIKA';
  }

  select.addEventListener('change', update);
  update();
})();
