/* Flagship Solar - Xero customer creation helper */
(function () {

  function init() {
    var box = document.getElementById('qbXeroResults');
    var search = document.getElementById('qbXeroQ');

    var bridge=window.FlagshipQuoteBridge;
    if (!box || !search || !bridge) return;

    var btn = document.getElementById('qbXeroCreateCustomer');

    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'qbXeroCreateCustomer';
      btn.type = 'button';
      btn.className = 'btn ghost hidden';
      btn.style.marginTop = '8px';
      btn.textContent = '+ Create Customer in Xero';

      box.parentNode.insertBefore(btn, box.nextSibling);
    }

    function syncButton() {
      var text = (box.textContent || '').trim().toLowerCase();

      var noResult =
        text.indexOf('no xero customer found') >= 0;

      var alreadyPicked =
        !!(bridge.getQuote().xeroContact && bridge.getQuote().xeroContact.contactID);

      btn.classList.toggle(
        'hidden',
        !noResult || alreadyPicked
      );
    }

    new MutationObserver(syncButton).observe(box, {
      childList: true,
      subtree: true,
      characterData: true
    });

    syncButton();

    btn.addEventListener('click', function () {

      var clientInput = document.getElementById('qbClient');

      var name = (
        (clientInput && clientInput.value) ||
        search.value ||
        ''
      ).trim();

      if (!name) {
        alert('Enter the customer name first.');
        return;
      }

      var email = prompt(
        'Customer email (optional):',
        ''
      );

      if (email === null) return;

      var number = prompt(
        'Customer phone number (optional):',
        ''
      );

      if (number === null) return;

      btn.disabled = true;
      btn.textContent = 'Creating…';

      var quote=bridge.getQuote();
      bridge.request({
        action: 'xeroCreateContact',
        contact: {
          name: name,
          email: String(email).trim(),
          number: String(number).trim()
        }
      })

      .then(function (j) {

        if(!j.contactID)throw new Error('Missing contact acknowledgement. Check Xero before retrying.');
        if(bridge.getQuote()!==quote){alert('Customer created in Xero; select it in the current quote.');return;}
        var c = {
          contactID: j.contactID,
          name: j.name || name,
          email: j.email || String(email).trim(),
          number: j.number || String(number).trim()
        };

        quote.xeroContact = c;
        quote.client = c.name;

        if (clientInput) {
          clientInput.value = c.name;
        }

        search.value = c.name;

        var picked =
          document.getElementById('qbXeroPicked');

        if (picked) {
          picked.textContent =
            'Xero customer: ' +
            c.name +
            (
              j.created === false
                ? ' (existing contact)'
                : ' (created)'
            );
        }

        box.innerHTML = '';

        btn.classList.add('hidden');

        bridge.save();
      })

      .catch(function (e) {

        alert(
          'Could not create the Xero customer: ' +
          String(e.message || e)
        );

      })

      .finally(function () {

        btn.disabled = false;
        btn.textContent =
          '+ Create Customer in Xero';

        syncButton();

      });

    });

  }

  if (document.readyState === 'loading') {

    document.addEventListener(
      'DOMContentLoaded',
      init
    );

  } else {

    init();

  }

})();
