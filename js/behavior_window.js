// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
goog.require('goog.bind');

cr.define('apps_dev_tool', function() {
  'use strict';

  /** const*/ var AppsDevTool = apps_dev_tool.AppsDevTool;

  /**
   * BehaviorWindow class
   * Encapsulated handling of the 'Behavior' overlay page.
   * @constructor
   */
  function BehaviorWindow() {}

  cr.addSingletonGetter(BehaviorWindow);

  /**
   * Enum for tab names. Used to show and hide the different information.
   * Only one should be shown at a time.
   * @enum {string}
   * @const
   */
  BehaviorWindow.TabIds = {
    HISTORY_MODE: 'history-mode-tab',
    STREAM_MODE: 'stream-mode-tab',
    NOSELECTION_MODE: 'no-tab'
  };

  /**
   * Listens on the activity log api and adds activities.
   * @param {!ExtensionActivity} activity An activity from the
   *     activityLogPrivate api.
   */
  BehaviorWindow.onExtensionActivity = function(activity) {
    if (activity.extensionId == this.instance_.currentExtensionId_) {
      var act = new watchdog.Activity(activity);
      if (act.passesFilter(BehaviorWindow.instance_.activityFilter_)) {
        BehaviorWindow.addToDevActivityList(act);
      }
    }
  };

  /**
   * Hides the present overlay showing and clear all generated activity
   * lists.
   */
  var hideBehaviorOverlay = function() {
    BehaviorWindow.clearSummaryViewActivities();
    BehaviorWindow.stop();
    BehaviorWindow.clearDeveloperModeViewActivities();
    AppsDevTool.showOverlay(null);
  };


  BehaviorWindow.prototype = {
    /**
     * Maximum number of notable calls to display on the UI.
     * @private {number}
     * @const
     */
    MAX_NOTABLE_: 10,

    /**
     * Maximum line length for activity information on the UI.
     * @private {number}
     * @const
     */
    MAX_LINE_LENGTH_: 80,

    /**
     * Id of the currently selected extension.
     * @private {string}
     */
    currentExtensionId_: '',

    /**
     * Name of tab that is currently being displayed.
     * @private {!watchdog.BehaviorWindow.TabIds}
     */
    currentTab_: BehaviorWindow.TabIds.NOSELECTION_MODE,

    /**
     * Listener on the chrome.activityLogPrivate.onExtensionActivity event.
     * We need to keep track of it so the correct listener is removed when the
     * stop button is pressed.
     * @private {Function}
     */
    activityListener_: BehaviorWindow.onExtensionActivity.bind(BehaviorWindow),

    /**
     * Filter to use when displaying activity info. See activityLogPrivate API
     * for details of valid filters.
     * @private {!ActivityFilter}
     */
    activityFilter_: /** @type {!ActivityFilter} */ ({
      activityType: 'any',
      extensionId: '',
      apiCall: null,
      pageUrl: null,
      argUrl: null
    }),

    initializePage: function() {
      var overlay = $('overlay');
      cr.ui.overlay.setupOverlay(overlay);
      cr.ui.overlay.globalInitialization();

      // Register cancelOverlay event handler for ESC keydown event.
      overlay.addEventListener(
          'cancelOverlay', hideBehaviorOverlay.bind(overlay));
      $('close-behavior-overlay').addEventListener(
          'click', hideBehaviorOverlay.bind(this));

      var setVisibleTab = BehaviorWindow.setVisibleTab.bind(BehaviorWindow);
      $('history-tab').addEventListener('click', function() {
          setVisibleTab(BehaviorWindow.TabIds.HISTORY_MODE);
        }, false);
      $('realtime-tab').addEventListener('click', function() {
          setVisibleTab(BehaviorWindow.TabIds.STREAM_MODE);
        }, false);
    }
  };

  /**
   * Show the BehaviorWindow overlay for the item metadata
   * given in |item|..
   * @param {!Object} item A dictionary of item metadata. (from items_lists.js)
   */
  BehaviorWindow.showOverlay = function(item) {
    // Update the selected extenion icon and title.
    $('behavior-extension-icon').style.backgroundImage =
        'url(' + item.icon_url + ')';
    $('behavior-extension-title').textContent = item.name;

    // Set the filter to point at the newly selected extension.
    this.instance_.currentExtensionId_ = item.id;
    this.instance_.activityFilter_.extensionId =
        this.instance_.currentExtensionId_;

    // Before showing BehaviorWindow, a user does not choose any tab.
    this.instance_.currentTab_ = BehaviorWindow.TabIds.NOSELECTION_MODE;
    // Shows the history tab page initially.
    this.setVisibleTab(BehaviorWindow.TabIds.HISTORY_MODE);
    AppsDevTool.showOverlay($('behaviorOverlay'));
  };

  /**
   * Loads the activities for the extension from the DB.
   * Notable activities are also displayed in a different list.
   */
  BehaviorWindow.refreshActivityList = function() {
    this.clearSummaryViewActivities();
    if (this.instance_.currentTab_ != BehaviorWindow.TabIds.HISTORY_MODE ||
        !this.instance_.currentExtensionId_) {
      return;
    }
    var callback = this.addToSummaryModeLists.bind(this);
    watchdog.ActivityGroupList.getFilteredExtensionActivities(
        this.instance_.activityFilter_, callback);
  };

  /**
   * Adds activities from the result set to the summary mode lists.
   * @param {!watchdog.ActivityGroupList} activityList
   */
  BehaviorWindow.addToSummaryModeLists = function(activityList) {
      if (!activityList) {
        return;
      }
      var numNotable = 0;
      var numRegular = 0;
      activityList.getActivityGroups().forEach(function(group) {
        if (numNotable < this.instance_.MAX_NOTABLE_ && group.isNotable()) {
          this.addToNotableActivityList(group);
          numNotable++;
        }
        this.addToAllActivityList(group);
        numRegular++;
      }, this);

      // Only show the notable section if there are notable activities.
      if (numNotable > 0) {
        $('summary-mode-tab-notable').style.display = 'block';
      } else {
        $('summary-mode-tab-notable').style.display = 'none';
      }

      if (numRegular == 0) {
        $('empty-history').style.display = 'block';
      }
  };

  /**
   * Clear the history tab.
   */
  BehaviorWindow.clearSummaryViewActivities = function() {
    this.clearActivityCountList('activity-list-notable');
    this.clearActivityCountList('activity-list-all');
    $('empty-history').style.display = 'none';
  };

  /**
   * Clear the realtime tab.
   */
  BehaviorWindow.clearDeveloperModeViewActivities = function() {
    this.clearActivityCountList('activity-list-dev');
  };

  /**
   * Checks if the notable activity list has entries.
   * @return {boolean} True if the notable activity list has entries.
   */
  BehaviorWindow.hasNotableActivityList = function() {
    return $('activity-list-notable').innerText != '';
  };

  /**
   * Adds an activity to the notable activity list.
   * @param {!watchdog.ActivityGroup} group Activity group to add to the
   *     list.
   */
  BehaviorWindow.addToNotableActivityList = function(group) {
   this.addActivityToSummaryCountList(group, 'activity-list-notable');
  };

  /**
   * Adds an activity to the full activity list.
   * @param {!watchdog.ActivityGroup} group Activity group to add to list.
   */
  BehaviorWindow.addToAllActivityList = function(group) {
   this.addActivityToSummaryCountList(group, 'activity-list-all');
  };

  /**
   * Delete all generated activity children templates of a given listName
   * @param {string} listName Name of the list to delete. Should be the name
   *     of an existing div that can contain activity count info.
   */
  BehaviorWindow.clearActivityCountList = function(listName) {
    var parentNode = document.getElementById(listName);
    if (parentNode) {
      while (parentNode.firstChild) {
        parentNode.removeChild(parentNode.firstChild);
      }
      parent.innerHTML = '';
    }
  };

  /**
   * Adds an activity to the DB summary counts list.
   * @param {!watchdog.ActivityGroup} group Group to add to the list.
   * @param {string} listName Name of the list to add this to. Should be the
   *     name of an existing div that can contain activity count info.
   */
  BehaviorWindow.addActivityToSummaryCountList = function(group, listName) {
    var activitiesTemplate = document.querySelector(
        '#template-collection > [data-name="activity-list-count"]');
    var el = activitiesTemplate.cloneNode(true);
    el.setAttribute('data-id', group.getName() + '-count');

    document.getElementById(listName).appendChild(el);
    el.querySelector('#count').innerText = this.countText(
        group.getTotalCount());
    el.querySelector('#action').innerText = group.getName();

    // Set the page URL and make it link to the URL.
    var pageLink = el.querySelector('#pageURL-dev');
    var pageUrl = group.getUrl();
    pageLink.href = pageUrl;
    if (pageUrl.length > this.instance_.MAX_LINE_LENGTH_)
      pageUrl = pageUrl.substring(0, this.instance_.MAX_LINE_LENGTH_) + '...';
    pageLink.innerText = pageUrl;

    var activityCounts = group.getActivityCounts();
    var detailList = el.querySelector('#detail-list');
    var showToggle = false;

    for (var activity in activityCounts) {
      var listItem = document.createElement('li');
      listItem.appendChild(document.createTextNode(
          activity + ' ' + this.countText(activityCounts[activity])));
      detailList.appendChild(listItem);
      showToggle = true;
    }

    if (!showToggle) {
      el.querySelector('#item-arrow').style.visibility = 'hidden';
    } else {
      el.querySelector('#detail').style.display = 'none';
      el.querySelector('#item-toggle').addEventListener(
          'click', function() {
            BehaviorWindow.toggleDetailVisibility(el);
          }, false);
      el.querySelector('#action').addEventListener(
          'click', function() {
            BehaviorWindow.toggleDetailVisibility(el);
          }, false);
    }
  };

  /**
   * Toggles the visibility of a detail box.
   * @param {Element} elem Element containing a detail box and an arrow image.
   */
  BehaviorWindow.toggleDetailVisibility = function(elem) {
    var box = elem.querySelector('#detail');
    var arrow = elem.querySelector('#item-arrow');

    var visibility = box.style.display;
    if (visibility == 'block') {
      box.style.display = 'none';
      arrow.src = 'images/arrow_more.png';
    } else {
      box.style.display = 'block';
      arrow.src = 'images/arrow_less.png';
    }
  };

  /**
   *  Displays the appropriate elements for the current tab.
   */
  BehaviorWindow.refreshVisibleTab = function() {
    if (this.instance_.currentTab_ == BehaviorWindow.TabIds.HISTORY_MODE) {
      $('history-tab-panel').className = 'current-tab';
      $('realtime-tab-panel').className = '';
      $('summary-mode-tab-all').style.display = 'block';
    } else if (this.instance_.currentTab_ ==
               BehaviorWindow.TabIds.STREAM_MODE) {
      $('realtime-tab-panel').className = 'current-tab';
      $('history-tab-panel').className = '';
      $('dev-mode-tab-content').style.display = 'block';
      this.start();
    }
    this.refreshActivityList();
  };

  /**
   * Makes the tab visible and hides all others.
   * @param {watchdog.Watchdog.TabIds} tabId Name of the tab to show.
   */
  BehaviorWindow.setVisibleTab = function(tabId) {
    if (this.instance_.currentTab_ == tabId) {
      return;
    }
    // Clean up the state from the last tab.
    if (this.instance_.currentTab_ == BehaviorWindow.TabIds.HISTORY_MODE) {
      $('history-tab-panel').className = '';
      $('summary-mode-tab-notable').style.display = 'none';
      $('summary-mode-tab-all').style.display = 'none';
    } else if (this.instance_.currentTab_ ==
               BehaviorWindow.TabIds.STREAM_MODE) {
      $('realtime-tab-panel').className = '';
      $('dev-mode-tab-content').style.display = 'none';
      this.stop();
    }
    // Now set up the new tab.
    this.instance_.currentTab_ = tabId;
    this.refreshVisibleTab();
  };

  /**
   * Get text for displaying a count.
   * @param {number} count to display.
   * @return {string} Text to display containing the count value.
   */
  BehaviorWindow.countText = function(count) {
    // Don't need to support the <=0 case because it can't happen.
    // TODO(karenlees): If this is ever internationalized to more languages
    // (like Polish), this will need to be modified to handle arbitrarily
    // numbers of plurality.
    if (count == 1)
      return '(' + chrome.i18n.getMessage('countHistoryOne') + ')';
    else
      return '(' + chrome.i18n.getMessage(
          'countHistoryMultiple', [count]) + ')';
  };

  /**
   * Starts the reamtime mode listening for activity.
   */
  BehaviorWindow.start = function() {
    // Don't bother adding a listener if there is no extension selected.
    if (!this.instance_.currentExtensionId_) {
      return;
    }

    chrome.activityLogPrivate.onExtensionActivity.addListener(
        this.instance_.activityListener_);
    this.updateDevModeControls(true);
};

  /**
   * Stops listening on the activity log.
   */
  BehaviorWindow.stop = function() {
    chrome.activityLogPrivate.onExtensionActivity.removeListener(
        this.instance_.activityListener_);
    this.updateDevModeControls(false);
  };

  /**
   * Updates which buttons are visible in developer mode.
   * @param {boolean} running True if it is listening for activity.
   */
  BehaviorWindow.updateDevModeControls = function(running) {
    if (running) {
      // TODO(spostman): implement stop and clear buttons.
      // $('start').style.display = 'none';
      // $('stop').style.display = 'block';
    } else {
      // $('start').style.display = 'block';
      // $('stop').style.display = 'none';
    }
  };

  /**
   * Adds an activity to the developer mode activity list.
   * @param {!watchdog.Activity} activity Activity to add to the list.
   */
  BehaviorWindow.addToDevActivityList = function(activity) {
    var activitiesTemplate = document.querySelector(
        '#template-collection > [data-name="activity-list-dev"]');
    var el = activitiesTemplate.cloneNode(true);
    el.setAttribute('data-id', activity.getExtensionId() + '-dev');

    document.getElementById('activity-list-dev').appendChild(el);
    el.querySelector('#time-dev').innerText = activity.getTime();
    el.querySelector('#action-dev').innerText =
        activity.getDevModeActionString();

    // Set the page URL and make it link to the URL.
    var pageLink = el.querySelector('#pageURL-dev');
    var pageUrl = activity.getPageUrl();
    pageLink.href = pageUrl;

    if (pageUrl.length > this.instance_.MAX_LINE_LENGTH_) {
      pageUrl = pageUrl.substring(0, this.instance_.MAX_LINE_LENGTH_) + '...';
    }
    pageLink.innerText = pageUrl;

    // Add the list of arguments. If there are arguments default them to hidden
    // and add the listener on the arrow so they can be expanded.
    var showToggle = false;
    var argsList = el.querySelector('#args-dev');
    var args = activity.getArgs();
    args.forEach(function(arg) {
      var listItem = document.createElement('li');
      listItem.appendChild(document.createTextNode(JSON.stringify(arg)));
      argsList.appendChild(listItem);
      showToggle = true;
    });

    var webRequestDetails = activity.getWebRequest();
    if (webRequestDetails != null) {
      var webRequestList = el.querySelector('#webrequest-details');
      for (var key in webRequestDetails) {
        if (webRequestDetails.hasOwnProperty(key)) {
          var listItem = document.createElement('li');
          listItem.appendChild(document.createTextNode(
              key + ': ' + JSON.stringify(webRequestDetails[key])));
          webRequestList.appendChild(listItem);
          showToggle = true;
        }
      }
    }

    if (showToggle) {
      el.querySelector('#detail').style.display = 'none';
      el.querySelector('#activity-toggle-dev').addEventListener(
          'click', function() {
            BehaviorWindow.toggleDetailVisibility(el);
          }, false);
      el.querySelector('#action-dev').addEventListener(
          'click', function() {
            BehaviorWindow.toggleDetailVisibility(el);
          }, false);
    } else {
      el.querySelector('#item-arrow').style.visibility = 'hidden';
    }
  };

  // Export
  return {
    BehaviorWindow: BehaviorWindow
  };
});
