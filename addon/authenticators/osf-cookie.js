import Ember from 'ember';

import Base from 'ember-simple-auth/authenticators/base';
import config from 'ember-get-config';

/**
 * @module ember-osf
 * @submodule authenticators
 */

/**
 * Ember-simple-auth compatible authenticator based on session cookie.
 *
 * Intended to be used with the authorizer of the same name.
 *
 * @class OsfCookieAuthenticator
 * @extends ember-simple-auth/BaseAuthenticator
 */
export default Base.extend({
    // HACK: Lets us clear session manually, rather than after .invalidate method resolves
    store: Ember.inject.service(),
    session: Ember.inject.service(),
    currentUser: Ember.inject.service('current-user'),
    features: Ember.inject.service(),

    _test() {

      const opts = {
          method: 'GET',
          url: `${config.OSF.apiUrl}/${config.OSF.apiNamespace}/`,
          dataType: 'json',
          contentType: 'application/json',
          xhrFields: {
              withCredentials: true
          }
      }

      return this.get('currentUser').authenticatedAJAX(opts).then(res => {
            if (Array.isArray(res.meta.active_flags)) {
                this.get('features').setup(
                    res.meta.active_flags.reduce(function(acc, flag) {
                        acc[flag] = true;
                        return acc;
                    }, {})
                )
            }
            // Push the result into the store for later use by the current-user service
            // Note: we have to deepcopy res because pushPayload mutates our data
            // and causes an infinite loop because reasons
            if (res['meta']['current_user'] !== null ){
                this.get('store').pushPayload(Ember.copy(res['meta']['current_user'], true));
            } else {
                return Ember.$.Deferred().reject();
            }
            return res['meta']['current_user']['data'];
        });
    },
    restore(/* data */) {
        return this._test().fail((err) => { this.invalidate(err); });
    },

    /**
     * Send a request to the flask application to trigger invalidation of session remotely
     * @method invalidate
     */
    invalidate(data) {
        if (!data || data.id && data.status !== 401) {
            // If invalidate is called when loading the page to check if a cookie has permissions, don't redirect the user
            // But if invalidate is called without arguments, or for any other reason, interpret this as a straight logout request
            //   (and let the session get invalidated next time at the start of first page load)
            // Can't do this via AJAX request because it redirects to CAS, and AJAX + redirect = CORS issue

            // Manually clear session before user leaves the page, since we aren't sticking around for ESA to do so later
            return this.get('session.session')._clear(true);
        } else {
            // This branch is expected to be called when a test request reveals the user to lack permissions... so session should be wiped
            return Ember.RSVP.resolve();
        }
    },
    /**
     * For now, simply verify that a token is present and can be used
     * @method authenticate
     * @param code
     * @return {Promise}
     */
    authenticate(code) {
        // NOTE: Must be wrapped in an RSVP promise
        // _test returns a Jquery Promise but authenticate expects an RSVP Promise
        return new Ember.RSVP.Promise((resolve, reject) =>
            this._test(code).then(resolve).fail(reject)
        );
    }
});
