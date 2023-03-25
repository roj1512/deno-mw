// Unit test for `Bot`
import {
  assertSpyCallArg,
  resolvesNext,
  stub,
} from "https://deno.land/std@0.181.0/testing/mock.ts";
import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.181.0/testing/asserts.ts";
import { Bot, SiteUrl } from "./bot.ts";

Deno.test("Test pages", async (t) => {
  // The response of successful page request
  const pageResp = {
    "batchcomplete": "",
    "query": {
      "pages": {
        "634": {
          "pageid": 634,
          "ns": 0,
          "title": "Example page",
          "revisions": [
            {
              "slots": {
                "main": {
                  "contentmodel": "wikitext",
                  "contentformat": "text/x-wiki",
                  "*": "This is an example page!!",
                },
              },
            },
          ],
        },
      },
    },
  };

  await t.step("Get page successfully", async () => {
    const bot = new Bot(SiteUrl.fandom("ncs", "zh"));

    stub(bot.client, "invoke", resolvesNext([pageResp])); // Mock the `invoke` function

    const page = await bot.page("Example page");
    assertEquals(page.title, "Example page");
    assertEquals(page.pageId, 634);
    assertEquals(page.text, "This is an example page!!");
  });

  await t.step("Get page failed", () => {
    const bot = new Bot(SiteUrl.fandom("ncs", "zh"));

    const pageFailedResp = { // The response of failed page request (page not exist)
      "batchcomplete": "",
      "query": {
        "normalized": [
          {
            "from": "no no no",
            "to": "No no no",
          },
        ],
        "pages": {
          "-1": {
            "ns": 0,
            "title": "No no no",
            "missing": "",
          },
        },
      },
    };
    stub(bot.client, "invoke", resolvesNext([pageFailedResp]));

    assertRejects(async () => await bot.page("No no no"), Error);
  });

  await t.step("Save page successfully", async () => {
    const bot = new Bot(SiteUrl.wikipedia("test"));

    const editResp = { // Response of successful edit request
      edit: {
        result: "Success",
        pageid: 634,
        title: "Example page",
        contentmodel: "wikitext",
        oldrevid: 5520,
        newrevid: 5521,
        newtimestamp: "2027-07-11T16:05:33Z",
      },
    };

    stub(bot.client, "invoke", resolvesNext([pageResp, editResp]));

    const page = await bot.page("Example page");
    page.text = "This is new content";

    await page.save({ summary: "test", minor: true }); // No error throws
  });

  await t.step("Save page failed", async () => {
    const bot = new Bot(SiteUrl.wikipedia("test"));

    const editResp = { // Response of failed edit request (page protected)
      "error": {
        "code": "protectedpage",
        "info":
          "This page has been protected to prevent editing or other actions.",
        "*":
          "See https://en.wikipedia.org/w/api.php for API usage. Subscribe to the mediawiki-api-announce mailing list at &lt;https://lists.wikimedia.org/postorius/lists/mediawiki-api-announce.lists.wikimedia.org/&gt; for notice of API deprecations and breaking changes.",
      },
    };

    stub(bot.client, "invoke", resolvesNext([pageResp, editResp]));

    const page = await bot.page("Example page");
    page.text = "This is new content";

    assertRejects(async () => await page.save({ summary: "new edit!" }), Error);
  });

  await t.step("Delete page successfully", async () => {
    const bot = new Bot(SiteUrl.wikipedia("test"));

    const deleteResp = { // Response of successful delete request
      "delete": {
        "title": "Example page",
        "reason": "Bye~",
        "logid": 2042,
      },
    };

    stub(bot.client, "invoke", resolvesNext([pageResp, deleteResp]));

    const page = await bot.page("Example page");
    await page.delete({ reason: "Bye~" }); // No error throws
  });

  await t.step("Delete page failed", async () => {
    const bot = new Bot(SiteUrl.wikipedia("test"));

    const deleteResp = { // Response of failed delete request (permission denied)
      "error": {
        "code": "permissiondenied",
        "info":
          "The action you have requested is limited to users in the group: [[Wikipedia:Admin]].",
        "*":
          "See https://en.wikipedia.org/w/api.php for API usage. Subscribe to the mediawiki-api-announce mailing list at &lt;https://lists.wikimedia.org/postorius/lists/mediawiki-api-announce.lists.wikimedia.org/&gt; for notice of API deprecations and breaking changes.",
      },
    };
    stub(bot.client, "invoke", resolvesNext([pageResp, deleteResp]));

    const page = await bot.page("Cats");
    assertRejects(async () => await page.delete(), Error);
  });
});

Deno.test("Test category", async (t) => {
  await t.step("Get category successfully", async () => {
    const bot = new Bot(SiteUrl.wikipedia("test"));

    const categoryResp = { // Response of category request
      "batchcomplete": "",
      "query": {
        "categorymembers": [
          {
            "ns": 0,
            "title": "Cat",
          },
          {
            "ns": 0,
            "title": "Kitten",
          },
          {
            "ns": 5,
            "title": "Wikipedia talk:WikiProject Cats/Archive 3",
          },
          {
            "ns": 14,
            "title": "Category:Cats by country",
          },
        ],
      },
    };

    stub(bot.client, "invoke", resolvesNext([categoryResp]));
    const category = await bot.category("Cats");
    assertEquals(category.articles, ["Cat", "Kitten"]);
  });
});

Deno.test("Test login", async (t) => {
  const botAccount = "BotAccount";
  const botPassword = "BotPassword";
  const loginToken =
    [...Array(40)].map(() => Math.floor(Math.random() * 16).toString(16)).join(
      "",
    ) + "+\\"; // Random generated
  const csrftoken =
    [...Array(40)].map(() => Math.floor(Math.random() * 16).toString(16)).join(
      "",
    ) + "+\\"; // Random generated

  const loginTokenResp = { // Response of login token request
    "batchcomplete": "",
    "query": {
      "tokens": {
        "logintoken": loginToken,
      },
    },
  };

  await t.step("Login successful", async () => {
    const bot = new Bot(SiteUrl.wikipedia("test"));

    const csrfTokenResp = { // Response of successful csrf token request
      "batchcomplete": "",
      "query": {
        "tokens": {
          "csrftoken": csrftoken,
        },
      },
    };

    const stubClient = stub(
      bot.client,
      "invoke",
      resolvesNext([loginTokenResp, {}, csrfTokenResp]),
    );
    await bot.login(botAccount, botPassword);

    // Assert `login` function is called with correct parameters
    assertSpyCallArg(stubClient, 1, 0, [true, {
      action: "login",
      lgname: botAccount,
      lgpassword: botPassword,
      lgtoken: loginToken,
    }]);
    assertEquals(bot.csrftoken, csrftoken);
  });

  // deno-lint-ignore require-await
  await t.step("Login failed", async () => {
    const bot = new Bot(SiteUrl.mediawiki());

    const csrfTokenResp = { // Response of failed csrf token request
      "batchcomplete": "",
      "query": {
        "tokens": {
          "csrftoken": "+\\",
        },
      },
    };
    stub(
      bot.client,
      "invoke",
      resolvesNext([loginTokenResp, {}, csrfTokenResp]),
    );
    assertRejects(async () => await bot.login(botAccount, botPassword), Error);
  });
});
