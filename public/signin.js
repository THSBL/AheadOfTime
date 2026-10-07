// The email sign-in page (server/emailLogin.ts): one tap only. A second tap
// would send the one-time link again, after the first already used it.
(function () {
  var form = document.getElementById('f');
  if (!form) return;
  form.addEventListener('submit', function (e) {
    if (form.getAttribute('data-sent')) return e.preventDefault();
    form.setAttribute('data-sent', '1');
    var b = form.querySelector('button');
    if (b) {
      b.disabled = true;
      b.textContent = 'Signing in…';
    }
  });
})();
