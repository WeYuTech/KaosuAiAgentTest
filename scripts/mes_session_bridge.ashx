<%@ WebHandler Language="C#" Class="AiAgentSessionBridge" %>

using System;
using System.Globalization;
using System.Net;
using System.Web;
using System.Web.Script.Serialization;
using System.Web.SessionState;

// 安裝為原 KSS_MES 應用程式根目錄的 AiAgentSession.ashx，不能放在助理子應用。
public sealed class AiAgentSessionBridge : IHttpHandler, IReadOnlySessionState
{
    public bool IsReusable { get { return false; } }

    public void ProcessRequest(HttpContext context)
    {
        context.Response.ContentType = "application/json; charset=utf-8";
        context.Response.Cache.SetCacheability(HttpCacheability.NoCache);
        context.Response.Cache.SetNoStore();
        context.Response.TrySkipIisCustomErrors = true;
        if (!String.Equals(context.Request.HttpMethod, "GET", StringComparison.Ordinal))
        {
            context.Response.StatusCode = 405;
            context.Response.Headers["Allow"] = "GET";
            context.Response.Write("{\"message\":\"僅允許讀取登入狀態\"}");
            return;
        }
        IPAddress remote;
        if (!IPAddress.TryParse(context.Request.UserHostAddress, out remote) || !IPAddress.IsLoopback(remote))
        {
            context.Response.StatusCode = 403;
            context.Response.Write("{\"message\":\"僅允許本機服務查核\"}");
            return;
        }
        try
        {
            HttpSessionState session = context.Session;
            Guid sessionId;
            DateTime expiration = DateTime.MinValue;
            string key = session == null ? null : Convert.ToString(session["Key"], CultureInfo.InvariantCulture);
            string identifier = session == null ? null : Convert.ToString(session["SessionId"], CultureInfo.InvariantCulture);
            object expires = session == null ? null : session["Expiration"];
            bool parsedExpiration = expires is DateTime;
            if (parsedExpiration) expiration = (DateTime)expires;
            else parsedExpiration = DateTime.TryParseExact(Convert.ToString(expires, CultureInfo.InvariantCulture), "yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture, DateTimeStyles.None, out expiration);
            if (String.IsNullOrWhiteSpace(key) || String.Equals(key, "false", StringComparison.OrdinalIgnoreCase)
                || !Guid.TryParse(identifier, out sessionId) || sessionId == Guid.Empty
                || !parsedExpiration
                || expiration <= DateTime.Now)
            {
                context.Response.StatusCode = 401;
                context.Response.Write("{\"message\":\"MES 登入無效或已逾期\"}");
                return;
            }
            // 不讀取網址、標頭或本文中的身分；不回傳 Token，也不更新 Session。
            context.Response.Write(new JavaScriptSerializer().Serialize(new {
                SessionId = sessionId.ToString("D"),
                Expiration = expiration.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture)
            }));
        }
        catch
        {
            context.Response.StatusCode = 503;
            context.Response.Write("{\"message\":\"目前無法查核 MES 登入\"}");
        }
    }
}
