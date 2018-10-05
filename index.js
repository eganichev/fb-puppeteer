require('dotenv').config();
const puppeteer = require('puppeteer');
const fs = require('fs');
let cookiesList;

if (process.env.USE_COOKIES === 'true') {
  try {
    cookiesList = require('./cookiesList');
  } catch (e) {
    console.error("There is no saved cookies");
  }
}

const initUrl = 'https://www.facebook.com';
const allSuggestedFriendsLink = 'https://www.facebook.com/find-friends/browser/';

const selectors = {
  loginButton: '#loginbutton',
  suggestedFriendsName: '.friendBrowserNameTitle a',
  suggestedFriendsLink: '#fbSearchResultsBox .friendBrowserNameTitle a',
  messageButton: '#pagelet_timeline_profile_actions a',
  currentUserName: '#fb-timeline-cover-name a',
  messageBox: '.fbNubFlyout .fbNubFlyoutFooter [contenteditable=true]',
  messageBoxModal: '.uiTextareaNoResize',
  messageBoxModalSendButton: '.uiOverlayFooter button',
};

const ID = {
  login: '#email',
  pass: '#pass',
};

const loginData = {
  username: process.env.USER_LOGIN,
  password: process.env.USER_PASSWORD
};

(async () => {
  console.log('current user: ',loginData);
  console.log('connect to: ',initUrl);

  const browser = await puppeteer.launch({
    headless: (process.env.USE_HEADLESS === 'true'),
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-notifications']
  });

  const page = await browser.newPage();
  const userSavedCookies = cookiesList && cookiesList[loginData.username];

  const initFacebook = async () => {
    if (userSavedCookies) {
      await page.setCookie(...userSavedCookies);
    }
    await page.goto(initUrl);

    return !!userSavedCookies;
  }

  const login = async () => {
    await page.waitForSelector(ID.login);
    await page.type(ID.login, loginData.username);
    await page.type(ID.pass, loginData.password);
    await page.waitFor(500);
    await page.click(selectors.loginButton);
    await page.waitForNavigation();
  }

  const openSuggestedFriendsList = async () => {
    await page.goto(allSuggestedFriendsLink);
  }

  const openUserPage = async (friendNumber) => {
    await page.waitForSelector(selectors.suggestedFriendsName);

    await page.evaluate((friendNumber, selectors) => {
      return document.querySelectorAll(selectors.suggestedFriendsLink)[friendNumber].click();
    }, friendNumber, selectors);

    await page.waitForNavigation();
  }

  const sendMessage = async () => {
    await page.waitForSelector(selectors.messageButton);
    await page.click(selectors.messageButton);

    await page.waitForSelector(selectors.currentUserName);
    const suggestedFriendsName = await page.evaluate((selector) => document.querySelector(selector).textContent, selectors.currentUserName);

    console.log('sending message to: ',suggestedFriendsName);
    try {
      await page.waitForResponse(response => response.url().includes('https://www.facebook.com/api/graphqlbatch/'));
      await page.waitForResponse(response => response.url().includes('https://www.facebook.com/ajax/bz'));
      await page.waitForSelector(selectors.messageBox, 5000);
      await page.type(selectors.messageBox, `Hello ${suggestedFriendsName}`);
    } catch (e) {
      await page.waitForSelector(selectors.messageBoxModal);
      await page.type(selectors.messageBoxModal, `Hello ${suggestedFriendsName}`);
      await page.click(selectors.messageBoxModalSendButton);
    }

    await page.keyboard.press('Enter');
    await page.waitForResponse(response => response.url().includes('https://www.facebook.com/messaging/send/'));
    await page.keyboard.press('Escape');
  }

  const closeApp = async () => {
    const cookies = await page.cookies();
    const userCookies = cookiesList || {};

    userCookies[loginData.username] = cookies;

    fs.writeFile('cookiesList.json', JSON.stringify(userCookies), 'utf8', async () => {
      await browser.close();
    });
  }

  const loggedIn = await initFacebook();
  if (!loggedIn) await login();

  await openSuggestedFriendsList();

  const numberOfSuggestedFriends = await page.$$eval(selectors.suggestedFriendsLink, links => links.length);

  for (let i = 0; i < 5; i++) {
    if (numberOfSuggestedFriends < i+1) {
      console.error(`This user have only ${numberOfSuggestedFriends} FB suggested friends`);
      break;
    };

    await openUserPage(i);
    await sendMessage();
    await openSuggestedFriendsList();
  }
  await closeApp();
})();


