(function () {
  var select = document.querySelector('[data-thickness-filter]');
  if (!select) return;

  function update() {
    var groups = document.querySelectorAll('[data-material-group]');
    groups.forEach(function (group) {
      var isMatch = group.getAttribute('data-material-group') === select.value;
      group.hidden = !isMatch;
    });
  }

  select.addEventListener('change', update);
  update();
})();
