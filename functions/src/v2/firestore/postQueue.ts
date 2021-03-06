import * as functions from "firebase-functions";
import { App } from "@slack/bolt";
import { REGION } from "../../lib/constants";
import { ZennClient } from "../../lib/zennClient";
import { TwitterClient } from "../../lib/twitterClient";
import { QiitaClient } from "../../lib/qiitaClient";
import { NoteClient } from "../../lib/noteClient";
import { createReportBlock } from "../lib/createReportBlock";
import { db } from "../lib/db";
import { findPreviousReport } from "../lib/findPreviousReport";
import { currentDateTimeWithFormat } from "../lib/dateTime";

const config = functions.config();

const app = new App({
  signingSecret: config.slack.bot_token,
  token: config.slack.bot_token,
  processBeforeResponse: true,
});

app.error(async (e) => {
  console.log(e);
});

type PostQueue = {
  userName: string;
  userId: string;
  createdAt: string;
  channelId: string;
  zennUser: string;
  qiitaUser: string;
  noteUser: string;
  twitterUser: string;
  comment: string;
};

export const onCreate = functions
  .region(REGION)
  .firestore.document("post-queue/{docId}")
  .onCreate(async (snapshot, context) => {
    const docData = snapshot.data() as PostQueue;

    try {
      const zennIndex = docData.zennUser
        ? await new ZennClient(docData.zennUser).fetchIndex()
        : null;
      const twitterIndex = docData.twitterUser
        ? await new TwitterClient(docData.twitterUser).fetchIndex()
        : null;
      const noteIndex = docData.noteUser
        ? await new NoteClient(docData.noteUser).fetchIndex()
        : null;
      const qiitaIndex = docData.qiitaUser
        ? await new QiitaClient(docData.qiitaUser).fetchIndex()
        : null;

      // 過去指標の取得
      const previousReport = await findPreviousReport(docData.userId);

      // チャネルへのPOST
      await app.client.chat.postMessage({
        token: config.slack.bot_token,
        channel: docData.channelId,
        text: "",
        blocks: createReportBlock({
          userName: docData.userName,
          createdAt: docData.createdAt,
          zennUser: docData.zennUser,
          qiitaUser: docData.qiitaUser,
          noteUser: docData.noteUser,
          twitterUser: docData.twitterUser,
          comment: docData.comment,
          zennIndex,
          qiitaIndex,
          noteIndex,
          twitterIndex,
          previousReport,
        }),
      });

      // 履歴の記録
      await db
        .collection("versions")
        .doc("v1")
        .collection("reports")
        .add({
          ...docData,
          postedAt: currentDateTimeWithFormat(),
          zennIndex,
          qiitaIndex,
          noteIndex,
          twitterIndex,
        });
    } catch (e) {
      console.log(e);
      await app.client.chat.postEphemeral({
        token: config.slack.bot_token,
        channel: docData.channelId,
        user: docData.userId,
        text:
          "⚠️ 指標取得に失敗しました。入力したアカウント名に間違いがないかご確認ください。",
      });
    }
  });
