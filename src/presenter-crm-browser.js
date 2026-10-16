import {launchLeadBrowser} from './lead-browser.js';
import {CRM_ORIGIN,parseCrmActivity,normalizeCrmName} from './presenter-crm.js';

// Uses the selectors already present in src/lead-sync.js, without interacting
// with user-entered content or sending credentials to the browser client.
export async function readPresenterCrm({name,pin}, {launch=launchLeadBrowser,chromiumOverride}={}){
 const chromium=chromiumOverride|| (await import('playwright')).chromium;
 const browser=await launch({chromium});
 let context;
 try{
  context=await browser.newContext({timezoneId:'America/Argentina/Buenos_Aires'});
  await context.route('**/*',route=>['image','media','font'].includes(route.request().resourceType())?route.abort():route.continue());
  const page=await context.newPage();
  page.setDefaultTimeout(12000);
  await page.goto(CRM_ORIGIN+'/floor/activity',{waitUntil:'domcontentloaded',timeout:25000});
  const login=page.getByRole('heading',{name:'¿Quién sos?',exact:true});
  const activity=page.getByText('mi mes',{exact:false}).first();
  const mustLogin=await login.isVisible().catch(()=>false);
  if(mustLogin){
   await page.getByRole('textbox',{name:'Buscá tu nombre'}).fill(name);
   await page.getByRole('button',{name:name+' Liniers',exact:true}).click();
   for(const digit of pin)await page.getByRole('button',{name:digit,exact:true}).click();
   await page.getByRole('button',{name:'Entrar',exact:true}).click();
   try{await page.waitForURL(url=>url.pathname!=='/floor/login',{timeout:12000});}
   catch{const err=new Error('No se pudo confirmar el PIN en Liniers.');err.code='CRM_AUTH_REJECTED';throw err;}
  }
  if(new URL(page.url()).pathname!=='/floor/activity')await page.goto(CRM_ORIGIN+'/floor/activity',{waitUntil:'domcontentloaded',timeout:25000});
  await page.getByText('mi mes',{exact:false}).first().waitFor({state:'visible',timeout:12000});
  // The CRM header identifies which account is actually active.
  const header=await page.locator('header').innerText();
  const identity=header.split('·')[0].trim().replace(/^[A-Z]{2}\s+(?=[A-ZÁÉÍÓÚÑ][a-záéíóúñ])/,'').trim();
  if(!normalizeCrmName(identity).startsWith(normalizeCrmName(name)))
   throw Object.assign(new Error('La sesión del CRM corresponde a otra cuenta.'),{code:'CRM_IDENTITY_MISMATCH'});
  const main=await page.locator('main').innerText();
  return {...parseCrmActivity(main),sourceLabel:name};
 }finally{
  await context?.close().catch(()=>{});
  await browser.close().catch(()=>{});
 }
}
