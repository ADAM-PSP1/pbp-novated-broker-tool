import React, { useState, useMemo } from 'react';
import { generatePbpPdf } from './generatePbpPdf';

const PSP = {
  blue:"#0A50D3",blue700:"#0840A8",blue100:"#E1ECFB",
  lime:"#A1E220",limeSoft:"#DBEE73",limeTint:"rgba(161,226,32,0.14)",
  dark:"#2D2F28",page:"#0B1012",card:"#FFFFFA",pageTint:"#F4F5EE",
  border:"#E5E7E0",text:"#000000",textMuted:"#4A4D43",
  textOnDark:"#FFFFFA",textOnDarkM:"#A8ABA0",
  shadowMd:"0 4px 8px rgba(11,16,18,0.06),0 8px 24px rgba(11,16,18,0.08)",
  shadowLg:"0 12px 24px rgba(11,16,18,0.10),0 24px 48px rgba(11,16,18,0.12)",
  shadowSm:"0 1px 2px rgba(11,16,18,0.06),0 1px 3px rgba(11,16,18,0.08)",
};
const GFONTS=`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&family=Lato:wght@400;700&display=swap');`;

const DEFAULT_RUNNING={
  "Small Car":    {fuel:7.5,rego:700, insurance:1000,service:350,tyres:300},
  "Medium Car":   {fuel:9,  rego:800, insurance:1100,service:400,tyres:380},
  "Prestige Car": {fuel:10, rego:900, insurance:2000,service:550,tyres:600},
  "Large Car":    {fuel:12, rego:1050,insurance:1500,service:500,tyres:400},
  "People Movers":{fuel:11, rego:900, insurance:1400,service:450,tyres:380},
  "Compact SUV":  {fuel:9,  rego:800, insurance:1400,service:400,tyres:380},
  "Medium SUV":   {fuel:10.5,rego:800,insurance:1500,service:450,tyres:400},
  "4WD":          {fuel:12, rego:1000,insurance:1800,service:550,tyres:500},
  "EV":           {fuel:14, rego:700, insurance:2000,service:250,tyres:600},
  "4WD Utilities":{fuel:12, rego:1000,insurance:1800,service:550,tyres:500},
};
const BASE_KM=15000;
const RUNNING_KEYS=["fuel","rego","insurance","service","tyres"];
const RUNNING_LABELS={fuel:"Fuel (L/100km)",rego:"Registration ($/yr)",insurance:"Insurance ($/yr)",service:"Service ($/15,000km)",tyres:"Tyres ($/15,000km)"};
const CAR_CLASS_KEYS=Object.keys(DEFAULT_RUNNING);
const PAY_CYCLES={
  weekly:     {label:"Weekly",     divisor:52},
  fortnightly:{label:"Fortnightly",divisor:26},
  bimonthly:  {label:"Bi-monthly", divisor:24},
  monthly:    {label:"Monthly",    divisor:12},
};
const ATO_RESIDUAL={1:0.6563,2:0.5625,3:0.4688,4:0.3750,5:0.2813};
const TAX_BRACKETS=[
  {min:0,     max:18200,   rate:0,    base:0},
  {min:18201, max:45000,   rate:0.19, base:0},
  {min:45001, max:120000,  rate:0.325,base:5092},
  {min:120001,max:180000,  rate:0.37, base:29467},
  {min:180001,max:Infinity,rate:0.45, base:51667},
];
const MEDICARE=0.02,FBT_RATE=0.47,STAT_FRACTION=0.20;
const LUX_DEP_LIMIT=69674,LUX_DEP_RATE=0.25,CORP_TAX=0.30;
const FBT_EV_CAP=91387;
const ADMIN_PIN="TheRabbitHole!@#$1234";
const MAX_GST_CLAIM=6334,DEFERRED=2;
const TABS=["Inputs","Results","Salary","Savings","Quote","Repository"];

function calcTax(inc){
  if(inc<=0)return 0;
  const b=TAX_BRACKETS.find(b=>inc>=b.min&&inc<=b.max)||TAX_BRACKETS[4];
  return Math.round(b.base+(inc-b.min)*b.rate+inc*MEDICARE);
}
function pmtM(annRate,years,pv,fv){
  const r=annRate/12,n=years*12-DEFERRED;
  const fg=fv*Math.pow(1+r,DEFERRED);
  if(r===0)return(pv-fg)/n;
  const rn=Math.pow(1+r,n);
  return(pv*rn+fg)*r/((1+r)*(rn-1));
}
function calcComm({driveaway,amtFinBase,commissionBasis,commissionRate,commissionMaxType,commissionMaxVal,commissionMaxBasis}){
  const basis=commissionBasis==="on-road-price"?driveaway:amtFinBase;
  const uf=basis*(commissionRate/100);
  let maxAmt=null,maxType="No Max";
  if(commissionMaxType==="$"&&commissionMaxVal>0){maxAmt=commissionMaxVal;maxType="Max $";}
  else if(commissionMaxType==="%"&&commissionMaxVal>0){
    const mb=commissionMaxBasis==="on-road-price"?driveaway:amtFinBase;
    maxAmt=mb*(commissionMaxVal/100);maxType="Max %";
  }
  const cf=maxAmt!==null?Math.min(uf,maxAmt):uf;
  const capped=maxAmt!==null&&uf>maxAmt;
  return{fee:Math.max(0,cf),basis,uncappedFee:uf,capped,maxAmt,maxType:capped?maxType:"No Max"};
}
function calcLCA(driveaway,leaseTerm,mFin,residualExGST){
  const dxg=driveaway/1.1;
  if(dxg<=LUX_DEP_LIMIT)return{monthly:0,annual:0,applies:false,years:[]};
  const alxg=(mFin*12)/1.1,tlxg=alxg*leaseTerm;
  const ai=(tlxg-(dxg-residualExGST))/leaseTerm;
  let wdv=LUX_DEP_LIMIT,years=[],tot=0;
  for(let yr=1;yr<=leaseTerm;yr++){
    const dep=wdv*LUX_DEP_RATE;wdv-=dep;
    const td=dep+ai,sf=alxg-td,at=sf*CORP_TAX,ss=at/(1-CORP_TAX);
    tot+=ss;years.push({yr,dep,interest:ai,totalDeduction:td,shortfall:sf,afterTax:at,ss});
  }
  const avg=tot/leaseTerm;
  return{monthly:avg/12,annual:avg,applies:true,years};
}
const fmt=(n,d=0)=>new Intl.NumberFormat("en-AU",{style:"currency",currency:"AUD",minimumFractionDigits:d,maximumFractionDigits:d}).format(n);
const fmtPct=n=>(n*100).toFixed(2)+"%";
const fmtPct4=n=>(n*100).toFixed(4)+"%";

// ── UI Components ─────────────────────────────────────────
function PSPLogo({height=36}){
  return <img
    src="/powered-by-positive-white.png"
    alt="Powered by Positive"
    style={{height:height+"px",width:"auto",display:"block",userSelect:"none"}}
  />;
}
function Lbl({children}){return <p style={{fontSize:12,fontFamily:"Outfit,sans-serif",fontWeight:700,color:PSP.textMuted,marginBottom:5,letterSpacing:"0.02em",textTransform:"uppercase"}}>{children}</p>;}
function F({label,children}){return <div><Lbl>{label}</Lbl>{children}</div>;}
function Grid({cols=2,children}){return <div style={{display:"grid",gridTemplateColumns:`repeat(${cols},minmax(0,1fr))`,gap:14}}>{children}</div>;}
function Card({children,style={}}){return <div style={{background:PSP.card,borderRadius:24,boxShadow:PSP.shadowMd,padding:"24px 26px",marginBottom:16,...style}}>{children}</div>;}
function SectionTitle({icon,title,badge}){
  return <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18}}>
    <span style={{fontSize:18}}>{icon}</span>
    <span style={{fontFamily:"Outfit,sans-serif",fontWeight:700,fontSize:16,color:PSP.blue}}>{title}</span>
    {badge&&<span style={{marginLeft:"auto",background:PSP.limeTint,color:PSP.dark,fontSize:11,fontFamily:"Outfit,sans-serif",fontWeight:700,padding:"3px 10px",borderRadius:999,border:`1px solid ${PSP.lime}`}}>{badge}</span>}
  </div>;
}
function StatCard({label,value,sub,green}){
  return <div style={{background:green?PSP.card:PSP.blue100,border:`1.5px solid ${green?PSP.lime:PSP.blue}`,borderRadius:16,padding:"18px 20px",boxShadow:PSP.shadowMd}}>
    <p style={{fontSize:11,fontFamily:"Outfit,sans-serif",fontWeight:700,color:PSP.textMuted,marginBottom:8,textTransform:"uppercase",letterSpacing:"0.06em"}}>{label}</p>
    <p style={{fontSize:26,fontFamily:"Outfit,sans-serif",fontWeight:900,color:green?PSP.dark:PSP.blue,margin:0,lineHeight:1}}>{value}</p>
    {sub&&<p style={{fontSize:12,color:PSP.textMuted,marginTop:6,fontFamily:"Lato,sans-serif"}}>{sub}</p>}
  </div>;
}

function MTable({rows,method}){
  const isEV=method==="EV";
  return <div style={{overflowX:"auto"}}>
    <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,fontFamily:"Lato,sans-serif"}}>
      <thead>
        <tr style={{borderBottom:`2px solid ${PSP.border}`}}>
          <th style={{padding:"9px 10px",textAlign:"left",color:PSP.textMuted,fontWeight:700,fontFamily:"Outfit,sans-serif",fontSize:11,textTransform:"uppercase",letterSpacing:"0.06em"}}>Item</th>
          <th style={{padding:"9px 10px",textAlign:"right",color:PSP.textMuted,fontWeight:700,fontFamily:"Outfit,sans-serif",fontSize:11,textTransform:"uppercase",letterSpacing:"0.06em",whiteSpace:"nowrap"}}>No salary pkg</th>
          <th style={{padding:"9px 10px",textAlign:"right",color:PSP.blue,fontWeight:700,fontFamily:"Outfit,sans-serif",fontSize:11,textTransform:"uppercase",letterSpacing:"0.06em",whiteSpace:"nowrap"}}>{method}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row,i)=>{
          const noPkg=row[1];
          const active=isEV?row[3]:row[2];
          return <tr key={i} style={{borderBottom:`1px solid ${PSP.border}`,background:i%2===0?PSP.pageTint:PSP.card}}>
            <td style={{padding:"10px",color:PSP.text,fontSize:13}}>{row[0]}</td>
            <td style={{padding:"10px",textAlign:"right",color:PSP.textMuted}}>{typeof noPkg==="number"?fmt(noPkg):noPkg}</td>
            <td style={{padding:"10px",textAlign:"right",fontWeight:700,fontFamily:"Outfit,sans-serif",color:typeof active==="number"&&active<0?"#D33A2C":PSP.blue}}>{typeof active==="number"?fmt(active):active}</td>
          </tr>;
        })}
      </tbody>
    </table>
  </div>;
}

export default function App(){
  const [tab,setTab]=useState(0);
  const [showAdmin,setShowAdmin]=useState(false);
  const [adminTab,setAdminTab]=useState("config");
  const [adminPin,setAdminPin]=useState("");
  const [pinError,setPinError]=useState(false);
  const [brokerMargin,setBrokerMargin]=useState(4.22);
  const [leaseRate,setLeaseRate]=useState(null);
  const [costOfFunds,setCostOfFunds]=useState(8.45);
  const [mgmtFee,setMgmtFee]=useState(35);
  const [undisclosedFee,setUndisclosedFee]=useState(990);
  const [applicationFee,setApplicationFee]=useState(495);
  const [fuelPrice,setFuelPrice]=useState(2.40);
  const [fuelPrice4WD,setFuelPrice4WD]=useState(3.00);
  const [evRatePerKm,setEvRatePerKm]=useState(0.0547);
  const [runningTable,setRunningTable]=useState(()=>JSON.parse(JSON.stringify(DEFAULT_RUNNING)));
  const [adminCommissionRate,setAdminCommissionRate]=useState(8);
  const [commissionBasis,setCommissionBasis]=useState("on-road-price");
  const [commissionMaxType,setCommissionMaxType]=useState("%");
  const [commissionMaxVal,setCommissionMaxVal]=useState(10);
  const [commissionMaxBasis,setCommissionMaxBasis]=useState("amount-financed");
  const [commissionIncluded,setCommissionIncluded]=useState(true);
  const [brokerName,setBrokerName]=useState("Your Brokerage");
  const [brokerPhone,setBrokerPhone]=useState("1300 000 000");
  const [brokerContact,setBrokerContact]=useState("broker@email.com");
  const [empName,setEmpName]=useState("");
  const [employer,setEmployer]=useState("");
  const [empState,setEmpState]=useState("");
  const [annualSalary,setAnnualSalary]=useState(90000);
  const [payCycle,setPayCycle]=useState("fortnightly");
  const [leaseTerm,setLeaseTerm]=useState(3);
  const [annualKm,setAnnualKm]=useState(15000);
  const [vehicleMake,setVehicleMake]=useState("");
  const [vehicleModel,setVehicleModel]=useState("");
  const [vehicleVariant,setVehicleVariant]=useState("");
  const [carClass,setCarClass]=useState("Medium Car");
  const [fbtMethod,setFbtMethod]=useState("ECM");
  const [driveaway,setDriveaway]=useState(45000);
  const [runningOverride,setRunningOverride]=useState({});
  const [quoteCommissionRate,setQuoteCommissionRate]=useState("");
  const [savedQuotes,setSavedQuotes]=useState([]);
  const [editingQuoteId,setEditingQuoteId]=useState(null);
  const [showBudgetWarning,setShowBudgetWarning]=useState(false);

  const isEV=fbtMethod==="EV";
  const is4WD=carClass==="4WD"||carClass==="4WD Utilities";
  const evCapExceeded=carClass==="EV"&&driveaway>FBT_EV_CAP;
  const fbtLocked=carClass==="EV"&&!evCapExceeded;
  const method=fbtMethod;

  const gstFull=Math.round(driveaway/11);
  const gstClaimed=Math.min(gstFull,MAX_GST_CLAIM);
  const gstExcess=Math.max(0,gstFull-MAX_GST_CLAIM);
  const gstSaving=gstClaimed;
  const effectiveRate=leaseRate!==null?leaseRate:costOfFunds;
  const cycleDiv=PAY_CYCLES[payCycle]?.divisor||26;
  const cycleLabel=PAY_CYCLES[payCycle]?.label||"Fortnightly";
  const cycBadge="("+cycleLabel+")";
  const activeFuelPrice=is4WD?fuelPrice4WD:fuelPrice;
  const clsDefaults=runningTable[carClass]||runningTable["Medium Car"];
  const fuelRow=runningOverride["fuel"]!==undefined?runningOverride["fuel"]:clsDefaults.fuel;
  const annualFuel=isEV?evRatePerKm*annualKm:(fuelRow*annualKm/100)*activeFuelPrice;
  const runningItems=RUNNING_KEYS.map(k=>{
    const raw=runningOverride[k]!==undefined?runningOverride[k]:clsDefaults[k];
    let av;
    if(k==="fuel")av=annualFuel;
    else if(k==="service"||k==="tyres")av=raw*(annualKm/BASE_KM);
    else av=raw;
    const dr=(k==="fuel"&&isEV)?evRatePerKm:raw;
    return{key:k,label:(k==="fuel"&&isEV)?"Charging ($/km)":RUNNING_LABELS[k],raw:dr,annualVal:av};
  });
  const annualRunning=runningItems.reduce((s,i)=>s+i.annualVal,0);
  const monthlyRunning=annualRunning/12;
  const vehicleName=[vehicleMake,vehicleModel,vehicleVariant].filter(Boolean).join(" ")||carClass;
  const effectiveCommissionRate=quoteCommissionRate!==""?parseFloat(quoteCommissionRate)||0:adminCommissionRate;
  const amtFinBase=driveaway-gstClaimed+gstExcess+applicationFee;
  const commission=commissionIncluded
    ?calcComm({driveaway,amtFinBase,commissionBasis,commissionRate:effectiveCommissionRate,commissionMaxType:commissionMaxType==="none"?"":commissionMaxType,commissionMaxVal,commissionMaxBasis})
    :{fee:0,basis:driveaway,uncappedFee:0,capped:false,maxAmt:null,maxType:"No Max"};
  const totalEarn=commission.fee+undisclosedFee;
  const brokerEarn=totalEarn*0.5;

  function tryUnlock(){if(adminPin===ADMIN_PIN){setShowAdmin(true);setPinError(false);}else{setPinError(true);setAdminPin("");}}
  function updateRunningTable(cls,key,val){setRunningTable(p=>({...p,[cls]:{...p[cls],[key]:+val}}));}
  function handleCarClass(v){
    setCarClass(v);
    setFbtMethod(v==="EV"?"EV":"ECM");
    setRunningOverride({});
  }
  function handleRunningOverride(key,val){setRunningOverride(p=>({...p,[key]:+val}));setShowBudgetWarning(true);}

  const c=useMemo(()=>{
    const div=PAY_CYCLES[payCycle]?.divisor||26;
    const gA=Math.round(driveaway/11),gC=Math.min(gA,MAX_GST_CLAIM),gE=Math.max(0,gA-MAX_GST_CLAIM);
    const base=driveaway-gC+gE+applicationFee;
    const commFee=commissionIncluded?calcComm({driveaway,amtFinBase:base,commissionBasis,commissionRate:effectiveCommissionRate,commissionMaxType:commissionMaxType==="none"?"":commissionMaxType,commissionMaxVal,commissionMaxBasis}).fee:0;
    const af=base+commFee+undisclosedFee;
    const rp=ATO_RESIDUAL[leaseTerm]||0.2813;
    const vehicleBase=driveaway-gC+gE;
    const rxg=vehicleBase*rp;
    const lesseeRate=(leaseRate!==null?leaseRate:(costOfFunds+brokerMargin))/100;
    const mFin=pmtM(lesseeRate,leaseTerm,af,-rxg);
    const lca=calcLCA(driveaway,leaseTerm,mFin,rxg);
    const lm=lca.monthly;
    const at=(mFin+(monthlyRunning/1.1)+mgmtFee+lm)*12;
    // FBT taxable value = 20% of full driveaway (inc GST)
    const fbtT=fbtMethod==="EV"?0:driveaway*STAT_FRACTION;
    const fbtP=fbtMethod==="ICE"?fbtT/(1-FBT_RATE)*FBT_RATE:0;
    const ecm=fbtMethod==="ECM"?fbtT:0;
    const ssE=at-ecm,ssV=at;
    const tG=calcTax(annualSalary),tE=calcTax(annualSalary-ssE),tV=calcTax(annualSalary-ssV);
    const nN=annualSalary-tG-at;
    const nE=(annualSalary-ssE)-tE-ecm;
    const nV=(annualSalary-ssV)-tV;
    const svE=tG-tE,svV=tG-tV;
    const sE=(nE-nN)*leaseTerm,sV=(nV-nN)*leaseTerm;
    const gE2=(ssE/11)*leaseTerm,gV=(ssV/11)*leaseTerm;
    const pc=v=>v/div;
    return{
      amtFin:af,amtFinBase:base,commFee,residualPct:rp,residualExGST:rxg,
      mFin,annualTotal:at,fbtTaxable:fbtT,fbtPayable:fbtP,ecm,ssECM:ssE,ssEV:ssV,
      lca,lcaMonthly:lm,pcLca:pc(lm*12),
      taxGross:tG,taxECM:tE,taxEV:tV,netNoSP:nN,netECM:nE,netEV:nV,
      taxSavingECM:svE,taxSavingEV:svV,savingECM:sE,savingEV:sV,
      gstOnPackageECM:gE2,gstOnPackageEV:gV,div,
      pcAnnualTotal:pc(at),pcMFin:pc(mFin*12),
      pcSsECM:pc(ssE),pcSsEV:pc(ssV),
      pcNetNoSP:pc(nN),pcNetECM:pc(nE),pcNetEV:pc(nV),
      pcTaxGross:pc(tG),pcTaxECM:pc(tE),pcTaxEV:pc(tV),
      pcEcm:pc(ecm),pcTaxSavingECM:pc(svE),pcTaxSavingEV:pc(svV),
      pcSalary:pc(annualSalary),pcMonthlyRunning:pc(monthlyRunning*12),pcMgmtFee:pc(mgmtFee*12),
    };
  },[driveaway,leaseTerm,leaseRate,costOfFunds,monthlyRunning,mgmtFee,undisclosedFee,applicationFee,annualSalary,fbtMethod,payCycle,commissionIncluded,commissionBasis,commissionMaxType,commissionMaxVal,commissionMaxBasis,effectiveCommissionRate]);

  const gstOnPkg=isEV?c.gstOnPackageEV:c.gstOnPackageECM;
  const mainSaving=isEV?c.savingEV:c.savingECM;
  const totalBenefit=mainSaving+gstSaving+gstOnPkg;

  function saveQuote(){
    const snap={id:editingQuoteId||Date.now().toString(),savedAt:new Date().toISOString(),brokerName,brokerPhone,brokerContact,empName,employer,empState,annualSalary,payCycle,leaseTerm,annualKm,vehicleMake,vehicleModel,vehicleVariant,carClass,fbtMethod,driveaway,runningOverride,quoteCommissionRate,commissionFee:c.commFee,effectiveCommissionRate,totalBenefit,mainSaving,gstSaving,gstOnPkg};
    setSavedQuotes(prev=>{const idx=prev.findIndex(q=>q.id===snap.id);if(idx>=0){const n=[...prev];n[idx]=snap;return n;}return[...prev,snap];});
    setEditingQuoteId(snap.id);setTab(5);
  }
  function loadQuote(q){
    setBrokerName(q.brokerName);setBrokerPhone(q.brokerPhone);setBrokerContact(q.brokerContact);
    setEmpName(q.empName);setEmployer(q.employer);setEmpState(q.empState||"");setAnnualSalary(q.annualSalary);
    setPayCycle(q.payCycle);setLeaseTerm(q.leaseTerm);setAnnualKm(q.annualKm);
    setVehicleMake(q.vehicleMake||"");setVehicleModel(q.vehicleModel||"");setVehicleVariant(q.vehicleVariant||"");
    setCarClass(q.carClass);setFbtMethod(q.fbtMethod);setDriveaway(q.driveaway);
    setRunningOverride(q.runningOverride||{});setQuoteCommissionRate(q.quoteCommissionRate||"");
    setEditingQuoteId(q.id);setTab(0);
  }
  function deleteQuote(id){setSavedQuotes(prev=>prev.filter(q=>q.id!==id));if(editingQuoteId===id)setEditingQuoteId(null);}
  function newQuote(){setEmpName("");setEmployer("");setEmpState("");setAnnualSalary(90000);setPayCycle("fortnightly");setLeaseTerm(3);setAnnualKm(15000);setVehicleMake("");setVehicleModel("");setVehicleVariant("");setCarClass("Medium Car");setFbtMethod("ECM");setDriveaway(45000);setRunningOverride({});setQuoteCommissionRate("");setEditingQuoteId(null);setTab(0);}

  function generatePDF(){
    // Hands all live state to the new layout generator (see src/generatePbpPdf.js).
    // Architecture: PDF layout lives in its own file so the design can be iterated
    // without touching the React component. To match the redesign mockup exactly,
    // see "Powered by Positive Quote Redesign.html" in the design package.
    generatePbpPdf({
      quoteId:    "#PBP" + String(Date.now()).slice(-6),
      quoteDate:  new Date().toLocaleDateString("en-AU",{day:"numeric",month:"long",year:"numeric"}),
      broker:     { name: brokerName, phone: brokerPhone, email: brokerContact },
      customer:   { name: empName, employer: employer, state: empState },
      annualSalary,
      leaseTerm,
      annualKm,
      payCycle,
      cycleLabel,
      cycleDiv,
      vehicle:    { make: vehicleMake, model: vehicleModel, variant: vehicleVariant },
      vehicleName,
      carClass,
      fbtMethod,
      isEV,
      driveaway,
      gstClaimed,
      applicationFee,
      effectiveRate,
      runningItems,
      annualFuel,
      annualRunning,
      monthlyRunning,
      mgmtFee,
      gstSaving,
      c,
    }).catch(err => {
      console.error("[PBP] PDF generation failed:", err);
      alert("Could not generate PDF: " + (err.message || err));
    });
  }

  function renderInputs(){
    return <div>
      <Card>
        <SectionTitle icon="⚙️" title="Broker details" badge="Step 1"/>
        <Grid>
          <F label="Business name"><input value={brokerName} onChange={e=>setBrokerName(e.target.value)}/></F>
          <F label="Phone"><input value={brokerPhone} onChange={e=>setBrokerPhone(e.target.value)}/></F>
          <F label="Email"><input value={brokerContact} onChange={e=>setBrokerContact(e.target.value)}/></F>
        </Grid>
      </Card>
      <Card>
        <SectionTitle icon="👤" title="Employee & lease details" badge="Step 2"/>
        <Grid>
          <F label="Employee name"><input value={empName} onChange={e=>setEmpName(e.target.value)} placeholder="Full name"/></F>
          <F label="Employer"><input value={employer} onChange={e=>setEmployer(e.target.value)} placeholder="Company name"/></F>
          <F label="State">
            <select value={empState} onChange={e=>setEmpState(e.target.value)}>
              <option value="">Select state...</option>
              {["ACT","NSW","NT","QLD","SA","TAS","VIC","WA"].map(s=><option key={s} value={s}>{s}</option>)}
            </select>
          </F>
          <F label="Gross annual salary ($)"><input type="number" value={annualSalary} onChange={e=>setAnnualSalary(+e.target.value)}/></F>
          <F label="Pay cycle"><select value={payCycle} onChange={e=>setPayCycle(e.target.value)}>{Object.entries(PAY_CYCLES).map(([k,{label}])=><option key={k} value={k}>{label}</option>)}</select></F>
          <F label="Lease term"><select value={leaseTerm} onChange={e=>setLeaseTerm(+e.target.value)}>{[1,2,3,4,5].map(t=><option key={t} value={t}>{t} year{t>1?"s":""}</option>)}</select></F>
          <F label="Annual km"><select value={annualKm} onChange={e=>setAnnualKm(+e.target.value)}>{Array.from({length:20},(_,i)=>(i+1)*2500).map(k=><option key={k} value={k}>{k.toLocaleString()} km</option>)}</select></F>
        </Grid>
      </Card>
      <Card>
        <SectionTitle icon="🚗" title="Vehicle details" badge="Step 3"/>
        <Grid>
          <F label="Make"><input value={vehicleMake} onChange={e=>setVehicleMake(e.target.value)} placeholder="e.g. Toyota"/></F>
          <F label="Model"><input value={vehicleModel} onChange={e=>setVehicleModel(e.target.value)} placeholder="e.g. RAV4"/></F>
          <F label="Variant"><input value={vehicleVariant} onChange={e=>setVehicleVariant(e.target.value)} placeholder="e.g. GXL Hybrid"/></F>
          <F label="Car class"><select value={carClass} onChange={e=>handleCarClass(e.target.value)}>{CAR_CLASS_KEYS.map(k=><option key={k} value={k}>{k}{k==="EV"?" (FBT exempt)":""}</option>)}</select></F>
          <F label="FBT method">
            <select value={fbtMethod} onChange={e=>setFbtMethod(e.target.value)} disabled={fbtLocked} style={{opacity:fbtLocked?0.6:1,cursor:fbtLocked?"not-allowed":"pointer"}}>
              <option value="ECM">ECM - Employee contribution method</option>
              <option value="EV">EV - FBT exempt</option>
            </select>
            {fbtLocked&&<p style={{fontSize:11,color:PSP.textMuted,fontFamily:"Lato,sans-serif",marginTop:4}}>Locked — EV FBT exemption applies under {fmt(FBT_EV_CAP)}</p>}
            {evCapExceeded&&<p style={{fontSize:11,color:"#E8A21A",fontFamily:"Lato,sans-serif",marginTop:4}}>⚠ Driveaway exceeds FBT exemption cap ({fmt(FBT_EV_CAP)}) — ECM applies</p>}
          </F>
          <F label="Driveaway cost ($)"><input type="number" value={driveaway} onChange={e=>{const v=+e.target.value;setDriveaway(v);if(carClass==="EV")setFbtMethod(v>FBT_EV_CAP?"ECM":"EV");}}/></F>
          <F label={"GST claimed (max "+fmt(MAX_GST_CLAIM)+")"}><input type="text" value={fmt(gstClaimed)+(gstExcess>0?" ("+fmt(gstExcess)+" financed)":"")} readOnly style={{background:PSP.blue100,color:gstExcess>0?"#E8A21A":PSP.blue,cursor:"default"}}/></F>
        </Grid>
        {commissionIncluded&&<div style={{marginTop:14,padding:"16px 18px",background:PSP.limeTint,border:`1.5px solid rgba(161,226,32,0.35)`,borderRadius:16}}>
          <p style={{fontSize:13,fontFamily:"Outfit,sans-serif",fontWeight:700,color:PSP.blue,marginBottom:10}}>Commission rate for this quote</p>
          <Grid>
            <F label={"Commission rate (%) — default: "+adminCommissionRate.toFixed(2)+"%"}>
              <input type="number" step="0.001" placeholder={adminCommissionRate.toFixed(2)} value={quoteCommissionRate} onChange={e=>setQuoteCommissionRate(e.target.value)}/>
            </F>
            <F label="Commission fee (calculated)">
              <input type="text" readOnly value={fmt(c.commFee)+(commission.capped?" ⚠ capped":"")} style={{background:PSP.blue100,color:commission.capped?"#E8A21A":PSP.blue,cursor:"default",fontFamily:"Outfit,sans-serif",fontWeight:700}}/>
            </F>
          </Grid>
          {quoteCommissionRate!==""&&<button onClick={()=>setQuoteCommissionRate("")} style={{marginTop:6,fontSize:12,color:PSP.textMuted,background:"none",border:"none",textDecoration:"underline",padding:"2px 0",fontFamily:"Lato,sans-serif"}}>Reset to admin default</button>}
          <div style={{marginTop:14,background:PSP.card,border:`1px solid ${PSP.border}`,borderRadius:14,padding:"14px 16px"}}>
            <p style={{fontSize:11,fontFamily:"Outfit,sans-serif",fontWeight:700,color:PSP.textMuted,marginBottom:10,textTransform:"uppercase",letterSpacing:"0.06em"}}>Earn split — commission + origination fee</p>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div style={{background:PSP.pageTint,border:`1px solid ${PSP.border}`,borderRadius:12,padding:"12px 14px"}}>
                <p style={{fontSize:11,fontFamily:"Outfit,sans-serif",fontWeight:700,color:PSP.textMuted,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>Total earn</p>
                <p style={{fontSize:20,fontFamily:"Outfit,sans-serif",fontWeight:800,color:PSP.blue,margin:0}}>{fmt(totalEarn)}</p>
                <p style={{fontSize:11,color:PSP.textMuted,marginTop:3,fontFamily:"Lato,sans-serif"}}>Commission + origination fee</p>
              </div>
              <div style={{background:PSP.limeTint,border:`1.5px solid ${PSP.lime}`,borderRadius:12,padding:"12px 14px"}}>
                <p style={{fontSize:11,fontFamily:"Outfit,sans-serif",fontWeight:700,color:PSP.dark,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>Your earn (broker)</p>
                <p style={{fontSize:20,fontFamily:"Outfit,sans-serif",fontWeight:800,color:PSP.dark,margin:0}}>{fmt(brokerEarn)}</p>
                <p style={{fontSize:11,color:PSP.dark,marginTop:3,fontFamily:"Lato,sans-serif"}}>50% of total earn</p>
              </div>
            </div>
          </div>
          <p style={{fontSize:11,color:PSP.textMuted,marginTop:10,lineHeight:1.6,fontFamily:"Lato,sans-serif"}}>* Commission figures are indicative only. Final commission may vary based on the employee's lending profile, credit assessment outcome, and financier pricing at the time of settlement.</p>
          {["VIC","NSW","NT","ACT"].includes(empState)&&<div style={{marginTop:10,background:"rgba(211,58,44,0.08)",border:"1.5px solid #D33A2C",borderRadius:12,padding:"12px 14px",display:"flex",gap:10,alignItems:"flex-start"}}>
            <span style={{fontSize:16,flexShrink:0,color:"#D33A2C"}}>⚠</span>
            <p style={{fontSize:12,color:"#D33A2C",fontWeight:700,lineHeight:1.6,fontFamily:"Lato,sans-serif",margin:0}}>State government employees in Victoria, New South Wales, the Northern Territory and the ACT are not eligible for third party novated leasing arrangements. Please confirm the employee's employer type before proceeding.</p>
          </div>}
          {["WA","SA","TAS","QLD"].includes(empState)&&<div style={{marginTop:10,background:"rgba(232,162,26,0.10)",border:"1.5px solid #E8A21A",borderRadius:12,padding:"12px 14px",display:"flex",gap:10,alignItems:"flex-start"}}>
            <span style={{fontSize:16,flexShrink:0,color:"#E8A21A"}}>⚠</span>
            <p style={{fontSize:12,color:"#92400e",fontWeight:700,lineHeight:1.6,fontFamily:"Lato,sans-serif",margin:0}}>State government employees in WA, SA, TAS and QLD are eligible for novated leasing, however earnings restrictions may apply under contract requirements. Commission may be reduced to $500 ex GST to meet these obligations.</p>
          </div>}
        </div>}
        <div style={{marginTop:14,background:PSP.blue100,border:`1.5px solid ${PSP.blue}`,borderRadius:12,padding:"10px 16px"}}>
          <p style={{fontSize:13,fontFamily:"Outfit,sans-serif",fontWeight:700,color:PSP.blue}}>
            Driveaway: {fmt(driveaway)} | GST claimed: {fmt(gstClaimed)}{gstExcess>0?" (capped)":""} | App fee: {fmt(applicationFee)} | ATO residual ex GST ({fmtPct(c.residualPct)}): {fmt(c.residualExGST)}
          </p>
        </div>
      </Card>
      <Card>
        <SectionTitle icon="⛽" title="Running costs" badge="Step 4"/>

        <div style={{overflowX:"auto",marginBottom:8}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,fontFamily:"Lato,sans-serif"}}>
            <thead>
              <tr style={{background:PSP.pageTint,borderBottom:`2px solid ${PSP.border}`}}>
                {["Item","Input","Annual (inc GST)","Monthly (inc GST)"].map(h=><th key={h} style={{padding:"9px 12px",textAlign:h==="Item"?"left":"right",fontWeight:700,fontFamily:"Outfit,sans-serif",color:PSP.textMuted,fontSize:11,textTransform:"uppercase",letterSpacing:"0.06em"}}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {runningItems.map(({key,label,raw,annualVal})=>(
                <tr key={key} style={{borderBottom:`1px solid ${PSP.border}`}}>
                  <td style={{padding:"9px 12px",color:PSP.text}}>{label}</td>
                  <td style={{padding:"6px 10px",textAlign:"right"}}>
                    <input type="number" value={raw} step={key==="fuel"?(isEV?"0.0001":"0.1"):"50"}
                      onChange={e=>{if(key==="fuel"&&isEV)setEvRatePerKm(+e.target.value);else handleRunningOverride(key,e.target.value);}}
                      style={{width:"100%",textAlign:"right",padding:"6px 10px",fontSize:13}}/>
                  </td>
                  <td style={{padding:"9px 12px",textAlign:"right",fontFamily:"Outfit,sans-serif",fontWeight:700,color:PSP.blue}}>{fmt(annualVal)}</td>
                  <td style={{padding:"9px 12px",textAlign:"right",color:PSP.textMuted}}>{fmt(annualVal/12)}</td>
                </tr>
              ))}
              <tr style={{background:PSP.limeTint}}>
                <td style={{padding:"9px 12px",fontFamily:"Outfit,sans-serif",fontWeight:700,color:PSP.dark}} colSpan={2}>Total</td>
                <td style={{padding:"9px 12px",textAlign:"right",fontFamily:"Outfit,sans-serif",fontWeight:800,color:PSP.dark}}>{fmt(annualRunning)}</td>
                <td style={{padding:"9px 12px",textAlign:"right",fontFamily:"Outfit,sans-serif",fontWeight:700,color:PSP.dark}}>{fmt(monthlyRunning)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10,flexWrap:"wrap"}}>
          {isEV
            ?<span style={{fontSize:12,color:PSP.textMuted,fontFamily:"Lato,sans-serif"}}>Charging: <strong style={{color:PSP.blue}}>${evRatePerKm.toFixed(4)}/km</strong> × <strong style={{color:PSP.blue}}>{annualKm.toLocaleString()} km</strong> = <strong style={{color:PSP.blue}}>{fmt(annualFuel)}/yr</strong></span>
            :<span style={{fontSize:12,color:PSP.textMuted,fontFamily:"Lato,sans-serif"}}>Fuel price: <strong style={{color:PSP.blue}}>{fmt(activeFuelPrice,2)}/L</strong>{is4WD?" (4WD rate)":""} — set in Admin</span>}
        </div>
        <button onClick={()=>setRunningOverride({})} style={{fontSize:12,color:PSP.textMuted,background:"none",border:"none",padding:"4px 0",textDecoration:"underline",fontFamily:"Lato,sans-serif"}}>Reset to class defaults</button>
      </Card>
      <div style={{marginBottom:16}}>
        {!showAdmin?(
          <div style={{border:`1.5px dashed ${PSP.border}`,borderRadius:16,padding:"14px 18px",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",background:"rgba(255,255,250,0.03)"}}>
            <span style={{fontSize:13,color:PSP.textOnDarkM,flex:1,fontFamily:"Lato,sans-serif"}}>Admin access</span>
            <input type="password" placeholder="Enter PIN" value={adminPin} onChange={e=>{setAdminPin(e.target.value);setPinError(false);}} onKeyDown={e=>e.key==="Enter"&&tryUnlock()} style={{width:140,fontSize:13,padding:"8px 12px"}}/>
            <button onClick={tryUnlock} style={{background:PSP.blue,color:"#fff",border:"none",borderRadius:14,padding:"9px 18px",fontSize:13,fontFamily:"Outfit,sans-serif",fontWeight:700}}>Unlock</button>
            {pinError&&<span style={{fontSize:12,color:"#D33A2C",width:"100%",fontFamily:"Lato,sans-serif"}}>Incorrect PIN.</span>}
          </div>
        ):(
          <Card style={{border:`2px solid ${PSP.lime}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <SectionTitle icon="⚙️" title="Admin configuration"/>
              <button onClick={()=>setShowAdmin(false)} style={{background:"rgba(211,58,44,0.12)",color:"#D33A2C",border:"none",borderRadius:10,padding:"6px 14px",fontSize:12,fontFamily:"Outfit,sans-serif",fontWeight:700}}>Lock</button>
            </div>
            <div style={{display:"flex",gap:6,marginBottom:18,borderBottom:`1px solid ${PSP.border}`,paddingBottom:12,flexWrap:"wrap"}}>
              {[["config","Finance & fees"],["commission","Commission"],["table","Running costs"]].map(([k,lbl])=>(
                <button key={k} onClick={()=>setAdminTab(k)} style={{padding:"7px 16px",fontSize:12,fontWeight:700,fontFamily:"Outfit,sans-serif",borderRadius:999,border:"none",background:adminTab===k?PSP.blue:PSP.pageTint,color:adminTab===k?"#fff":PSP.textMuted}}>{lbl}</button>
              ))}
            </div>
            {adminTab==="config"&&<div>
              <Grid>
                <F label="Monthly management fee ($)"><input type="number" value={mgmtFee} onChange={e=>setMgmtFee(+e.target.value)}/></F>
                <F label="Cost of funds (% p.a.)"><input type="number" step="0.01" value={costOfFunds} onChange={e=>setCostOfFunds(+e.target.value)}/></F>
                <F label="Broker margin (% p.a.)"><input type="number" step="0.01" value={brokerMargin} onChange={e=>setBrokerMargin(+e.target.value)}/></F>
                <F label="Undisclosed fee ($)"><input type="number" value={undisclosedFee} onChange={e=>setUndisclosedFee(+e.target.value)}/></F>
                <F label="Application fee ($)"><input type="number" value={applicationFee} onChange={e=>setApplicationFee(+e.target.value)}/></F>
                <F label="Override lessee rate (% p.a.)"><input type="number" step="0.01" placeholder={"Auto: "+costOfFunds+"%"} value={leaseRate===null?"":leaseRate} onChange={e=>setLeaseRate(e.target.value===""?null:+e.target.value)}/></F>
              </Grid>
              <div style={{marginTop:12,background:PSP.blue100,border:`1px solid ${PSP.border}`,borderRadius:12,padding:"12px 14px"}}>
                <p style={{fontSize:12,fontFamily:"Outfit,sans-serif",fontWeight:700,color:PSP.blue,marginBottom:4}}>Lessee rate: {(leaseRate!==null?leaseRate:(costOfFunds+brokerMargin)).toFixed(2)}% {leaseRate!==null?"(manual override)":"(cost of funds + broker margin)"}</p>
                <p style={{fontSize:11,color:PSP.textMuted,fontFamily:"Lato,sans-serif"}}>Commission is capitalised as a dollar fee — it does not affect the lessee rate.</p>
              </div>
              <div style={{height:1,background:PSP.border,margin:"14px 0"}}/>
              <p style={{fontSize:11,fontFamily:"Outfit,sans-serif",fontWeight:700,color:PSP.textMuted,marginBottom:10,textTransform:"uppercase",letterSpacing:"0.06em"}}>Fuel and energy rates</p>
              <Grid>
                <F label="Fuel price - standard ($/L)"><input type="number" step="0.01" value={fuelPrice} onChange={e=>setFuelPrice(+e.target.value)}/></F>
                <F label="Fuel price - 4WD ($/L)"><input type="number" step="0.01" value={fuelPrice4WD} onChange={e=>setFuelPrice4WD(+e.target.value)}/></F>
                <F label="EV energy cost ($/km)"><input type="number" step="0.0001" value={evRatePerKm} onChange={e=>setEvRatePerKm(+e.target.value)}/></F>
              </Grid>
            </div>}
            {adminTab==="commission"&&<div>
              <p style={{fontSize:13,color:PSP.textMuted,marginBottom:16,fontFamily:"Lato,sans-serif"}}>Set default commission rules. Brokers can override the rate per quote.</p>
              <Grid>
                <F label="Include commission"><select value={commissionIncluded?"yes":"no"} onChange={e=>setCommissionIncluded(e.target.value==="yes")}><option value="yes">Yes — capitalised into finance</option><option value="no">No — disabled</option></select></F>
                <F label="Commission basis"><select value={commissionBasis} onChange={e=>setCommissionBasis(e.target.value)}><option value="on-road-price">On-road price (driveaway)</option><option value="amount-financed">Amount financed (ex GST, ex commission)</option></select></F>
                <F label="Default commission rate (%)"><input type="number" step="0.001" value={adminCommissionRate} onChange={e=>setAdminCommissionRate(+e.target.value)}/></F>
                <F label="Cap type"><select value={commissionMaxType} onChange={e=>setCommissionMaxType(e.target.value)}><option value="none">No cap</option><option value="$">Dollar cap ($)</option><option value="%">Percentage cap (%)</option></select></F>
                {commissionMaxType!=="none"&&<F label={commissionMaxType==="$"?"Max commission ($)":"Max commission (%)"}><input type="number" step={commissionMaxType==="$"?"1":"0.001"} value={commissionMaxVal} onChange={e=>setCommissionMaxVal(+e.target.value)}/></F>}
                {commissionMaxType==="%"&&<F label="Max % basis"><select value={commissionMaxBasis} onChange={e=>setCommissionMaxBasis(e.target.value)}><option value="amount-financed">Amount financed</option><option value="on-road-price">On-road price</option></select></F>}
              </Grid>
            </div>}
            {adminTab==="table"&&<div>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:600,fontFamily:"Lato,sans-serif"}}>
                  <thead>
                    <tr style={{background:PSP.pageTint,borderBottom:`2px solid ${PSP.border}`}}>
                      <th style={{padding:"8px 10px",textAlign:"left",fontWeight:700,fontFamily:"Outfit,sans-serif",color:PSP.textMuted,fontSize:11,textTransform:"uppercase",letterSpacing:"0.06em",width:130}}>Car class</th>
                      {RUNNING_KEYS.map(k=><th key={k} style={{padding:"8px 10px",textAlign:"right",fontWeight:700,fontFamily:"Outfit,sans-serif",color:PSP.textMuted,fontSize:11,textTransform:"uppercase",letterSpacing:"0.06em"}}>{k==="fuel"?"Fuel":k==="rego"?"Rego":k==="insurance"?"Insurance":k==="service"?"Service":"Tyres"}</th>)}
                      <th style={{padding:"8px 10px",textAlign:"right",fontWeight:700,fontFamily:"Outfit,sans-serif",color:PSP.blue,fontSize:11,textTransform:"uppercase",letterSpacing:"0.06em"}}>Total/yr*</th>
                    </tr>
                  </thead>
                  <tbody>
                    {CAR_CLASS_KEYS.map((cls,ri)=>{
                      const r2=runningTable[cls]||{};
                      const total=(r2.rego||0)+(r2.insurance||0)+(r2.service||0)+(r2.tyres||0);
                      return <tr key={cls} style={{borderBottom:`1px solid ${PSP.border}`,background:ri%2===0?PSP.pageTint:PSP.card}}>
                        <td style={{padding:"6px 10px",fontFamily:"Outfit,sans-serif",fontWeight:700,color:PSP.blue}}>{cls}</td>
                        {RUNNING_KEYS.map(k=><td key={k} style={{padding:"4px 6px"}}><input type="number" value={r2[k]||0} onChange={e=>updateRunningTable(cls,k,e.target.value)} style={{width:"100%",textAlign:"right",padding:"4px 6px",fontSize:12,minWidth:70}}/></td>)}
                        <td style={{padding:"6px 10px",textAlign:"right",fontFamily:"Outfit,sans-serif",fontWeight:700,color:PSP.blue}}>{fmt(total)}</td>
                      </tr>;
                    })}
                  </tbody>
                </table>
              </div>
              <button onClick={()=>setRunningTable(JSON.parse(JSON.stringify(DEFAULT_RUNNING)))} style={{marginTop:8,fontSize:12,color:"#D33A2C",background:"none",border:"none",textDecoration:"underline",padding:"4px 0",fontFamily:"Lato,sans-serif"}}>Reset all to defaults</button>
            </div>}
          </Card>
        )}
      </div>
    </div>;
  }

  function renderResults(){
    const m=method;
    return <div>
      <div style={{background:PSP.blue100,border:`1.5px solid ${PSP.blue}`,borderRadius:12,padding:"10px 16px",marginBottom:14,display:"flex",gap:8,alignItems:"center"}}>
        <span style={{fontSize:13,fontFamily:"Outfit,sans-serif",fontWeight:700,color:PSP.blue}}>Pay cycle: {cycleLabel}</span>
        <span style={{fontSize:12,color:PSP.textMuted,fontFamily:"Lato,sans-serif"}}>— per-cycle figures shown as {cycleLabel.toLowerCase()}</span>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:12,marginBottom:16}}>
        <StatCard label={cycleLabel+" total cost"} value={fmt(c.pcMFin+c.pcMonthlyRunning+c.pcMgmtFee+(c.lca&&c.lca.applies?c.pcLca:0))} sub={"Finance + running + mgmt"+(c.lca&&c.lca.applies?" + LCA":"")}/>
        <div style={{background:PSP.page,border:`1.5px solid ${PSP.lime}`,borderRadius:16,padding:"18px 20px",boxShadow:PSP.shadowMd}}>
          <p style={{fontSize:11,fontFamily:"Outfit,sans-serif",fontWeight:700,color:PSP.textOnDarkM,marginBottom:8,textTransform:"uppercase",letterSpacing:"0.06em"}}>Impact to wage {cycBadge}</p>
          <p style={{fontSize:26,fontFamily:"Outfit,sans-serif",fontWeight:900,color:PSP.lime,margin:0,lineHeight:1}}>{fmt(c.pcAnnualTotal-(isEV?c.pcTaxSavingEV:c.pcTaxSavingECM))}</p>
        </div>
        <StatCard label={cycleLabel+" pre-tax package"} value={fmt(isEV?c.pcSsEV:c.pcSsECM)} green/>
        <StatCard label={cycleLabel+" post-tax contribution"} value={fmt(isEV?0:c.pcEcm)} sub={isEV?"No post-tax contribution":"Offsets FBT to $0"}/>
      </div>
      <Card>
        <SectionTitle icon="📊" title={"Vehicle costs "+cycBadge}/>
        <MTable method={m} rows={[
          ["Finance repayment "+cycBadge,   c.pcMFin,              c.pcMFin,       c.pcMFin],
          ["Running costs "+cycBadge,        c.pcMonthlyRunning,    c.pcMonthlyRunning, c.pcMonthlyRunning],
          ["Mgmt fee "+cycBadge,             "—",                   c.pcMgmtFee,    c.pcMgmtFee],
          ...(c.lca&&c.lca.applies?[["Luxury car adjustment "+cycBadge,"—",c.pcLca,c.pcLca]]:[]),
          ["Total cost "+cycBadge,           c.pcMFin+c.pcMonthlyRunning, c.pcAnnualTotal, c.pcAnnualTotal],
          ["Annual total",                   (c.mFin+monthlyRunning)*12,  c.annualTotal,   c.annualTotal],
        ].filter(Boolean)}/>
      </Card>
      <Card>
        <SectionTitle icon="📋" title="FBT and employee contribution"/>
        <MTable method={m} rows={[
          ["FBT taxable value (annual)",     0, c.fbtTaxable, 0],
          ["FBT payable (annual)",           0, c.fbtPayable, 0],
          ["Salary sacrifice pre-tax "+cycBadge, 0, c.pcSsECM, c.pcSsEV],
          ["Post-tax contribution "+cycBadge, c.pcAnnualTotal, c.pcEcm, 0],
        ]}/>
      </Card>
      <Card>
        <SectionTitle icon="🏦" title="Finance breakdown"/>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,fontFamily:"Lato,sans-serif"}}>
          <tbody>
            {[["Driveaway (on-road price)",fmt(driveaway)],["Less: GST claimed",fmt(-gstClaimed)],["Plus: GST excess (over cap)",fmt(gstExcess)],["Plus: Application fee",fmt(applicationFee)],["ATO residual ex GST ("+fmtPct(c.residualPct)+")",fmt(c.residualExGST)]].map(([k,v],i)=>(
              <tr key={i} style={{borderBottom:`1px solid ${PSP.border}`}}>
                <td style={{padding:"9px 0",color:PSP.text}}>{k}</td>
                <td style={{padding:"9px 0",textAlign:"right",fontFamily:"Outfit,sans-serif",fontWeight:700,color:PSP.blue}}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {c.lca&&c.lca.applies&&<Card>
        <SectionTitle icon="🚙" title="Luxury car adjustment (LCA)" badge="Internal only"/>
        <p style={{fontSize:12,color:PSP.textMuted,marginBottom:14,fontFamily:"Lato,sans-serif"}}>Driveaway ex GST ({fmt(driveaway/1.1)}) exceeds the ATO car depreciation limit ({fmt(LUX_DEP_LIMIT)}). An additional pre-tax salary sacrifice is required.</p>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:14}}>
          {[["Monthly LCA",fmt(c.lcaMonthly)],[cycleLabel+" LCA",fmt(c.pcLca)],["Annual LCA",fmt(c.lca.annual)]].map(([lbl,val])=>(
            <div key={lbl} style={{background:"rgba(232,162,26,0.10)",border:"1.5px solid #E8A21A",borderRadius:12,padding:"12px 14px"}}>
              <p style={{fontSize:11,fontFamily:"Outfit,sans-serif",fontWeight:700,color:"#92400e",marginBottom:4,textTransform:"uppercase",letterSpacing:"0.06em"}}>{lbl}</p>
              <p style={{fontSize:18,fontFamily:"Outfit,sans-serif",fontWeight:800,color:"#92400e",margin:0}}>{val}</p>
            </div>
          ))}
        </div>
        <p style={{fontSize:11,color:PSP.textMuted,marginTop:8,fontFamily:"Lato,sans-serif"}}>LCA is not disclosed to the employee on the client quote or PDF.</p>
      </Card>}
    </div>;
  }

  function renderSalary(){
    const m=method;
    return <div>
      <div style={{background:PSP.blue100,border:`1.5px solid ${PSP.blue}`,borderRadius:12,padding:"10px 16px",marginBottom:14,display:"flex",gap:8,alignItems:"center"}}>
        <span style={{fontSize:13,fontFamily:"Outfit,sans-serif",fontWeight:700,color:PSP.blue}}>Pay cycle: {cycleLabel}</span>
        <span style={{fontSize:12,color:PSP.textMuted,fontFamily:"Lato,sans-serif"}}>— figures shown per {cycleLabel.toLowerCase()} period</span>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:12,marginBottom:16}}>
        <StatCard label={cycleLabel+" tax saving"} value={fmt(isEV?c.pcTaxSavingEV:c.pcTaxSavingECM)} green sub={fmt(isEV?c.taxSavingEV:c.taxSavingECM)+" per year"}/>
        <StatCard label={leaseTerm+"-yr total tax saving"} value={fmt(isEV?c.taxSavingEV*leaseTerm:c.taxSavingECM*leaseTerm)} green/>
      </div>
      <Card>
        <SectionTitle icon="💰" title={"Salary breakdown "+cycBadge}/>
        <MTable method={m} rows={[
          ["Gross salary "+cycBadge,                  c.pcSalary,      c.pcSalary,               c.pcSalary],
          ["Salary sacrifice (pre-tax) "+cycBadge,    0,               c.pcSsECM,                c.pcSsEV],
          ["Revised taxable income "+cycBadge,         c.pcSalary,      c.pcSalary-c.pcSsECM,     c.pcSalary-c.pcSsEV],
          ["Income tax + Medicare "+cycBadge,          c.pcTaxGross,    c.pcTaxECM,               c.pcTaxEV],
          ["Post-tax contribution "+cycBadge,          c.pcAnnualTotal, c.pcEcm,                  0],
          ["Net take-home "+cycBadge,                  c.pcNetNoSP,     c.pcNetECM,               c.pcNetEV],
          ["Tax saving "+cycBadge,                     0,               fmt(c.pcTaxSavingECM),     fmt(c.pcTaxSavingEV)],
        ]}/>
      </Card>
      <Card>
        <SectionTitle icon="📅" title="Annual totals"/>
        <MTable method={m} rows={[
          ["Gross salary",            annualSalary,   annualSalary,  annualSalary],
          ["Salary sacrifice (pre-tax)", 0,            c.ssECM,       c.ssEV],
          ["Income tax + Medicare",    c.taxGross,     c.taxECM,      c.taxEV],
          ["Post-tax contribution",    c.annualTotal,  c.ecm,         0],
          ["Annual net salary",        c.netNoSP,      c.netECM,      c.netEV],
          ["Annual tax saving",        0,              fmt(c.taxSavingECM), fmt(c.taxSavingEV)],
        ]}/>
      </Card>
    </div>;
  }

  function renderSavings(){
    return <div>
      <div style={{background:PSP.page,borderRadius:20,padding:"24px 28px",marginBottom:16,color:PSP.textOnDark,boxShadow:PSP.shadowLg}}>
        <p style={{fontSize:11,fontFamily:"Outfit,sans-serif",fontWeight:700,color:PSP.textOnDarkM,marginBottom:6,textTransform:"uppercase",letterSpacing:"0.08em"}}>Total estimated benefit over {leaseTerm} year{leaseTerm>1?"s":""}</p>
        <p style={{fontSize:32,fontFamily:"Outfit,sans-serif",fontWeight:900,color:PSP.lime,margin:"0 0 4px"}}>{fmt(totalBenefit)}</p>
        <p style={{fontSize:14,color:PSP.textOnDarkM,fontFamily:"Lato,sans-serif",margin:0}}>Tax saving + GST on vehicle + GST on packaging</p>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:12,marginBottom:16}}>
        <StatCard label={leaseTerm+"-yr income tax saving"} value={fmt(mainSaving)} green sub="vs no salary packaging"/>
        <StatCard label="GST saving — vehicle" value={fmt(gstSaving)} green sub="One-off on purchase price"/>
        <StatCard label="GST saving — pre-tax package" value={fmt(gstOnPkg)} green sub={"Over "+leaseTerm+"-yr term"}/>
      </div>
      <Card>
        <SectionTitle icon="💸" title="GST savings breakdown"/>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,fontFamily:"Lato,sans-serif"}}>
          <tbody>
            {[
              ["GST saving on vehicle purchase (one-off)",fmt(gstSaving),"Employer claims GST on vehicle price, passed to employee"],
              ["GST saving on pre-tax package (over "+leaseTerm+" yrs)",fmt(gstOnPkg),"GST embedded in packaged lease and running costs"],
              ["Total GST saving",fmt(gstSaving+gstOnPkg),""],
              ["Total benefit (tax + GST)",fmt(totalBenefit),""],
            ].map(([k,v,sub],i)=>(
              <tr key={i} style={{borderBottom:`1px solid ${PSP.border}`,background:i>=2?PSP.limeTint:"transparent"}}>
                <td style={{padding:"10px 0"}}>
                  <p style={{fontSize:13,fontFamily:i>=2?"Outfit,sans-serif":"Lato,sans-serif",fontWeight:i>=2?700:400,color:i>=2?PSP.dark:PSP.text,margin:0}}>{k}</p>
                  {sub&&<p style={{fontSize:11,color:PSP.textMuted,margin:"2px 0 0",fontFamily:"Lato,sans-serif"}}>{sub}</p>}
                </td>
                <td style={{padding:"10px 0",textAlign:"right",fontFamily:"Outfit,sans-serif",fontWeight:700,color:i>=2?PSP.dark:PSP.blue,fontSize:i>=2?15:13}}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>;
  }

  function renderQuote(){
    const cashCost=c.pcAnnualTotal,taxSavingPC=isEV?c.pcTaxSavingEV:c.pcTaxSavingECM,wageImpact=cashCost-taxSavingPC;
    return <div>
      <Card>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:18,flexWrap:"wrap",gap:10}}>
          <div>
            <p style={{fontFamily:"Outfit,sans-serif",fontWeight:800,fontSize:18,color:PSP.blue,margin:0}}>{brokerName}</p>
            <p style={{fontSize:13,color:PSP.textMuted,fontFamily:"Lato,sans-serif",marginTop:2}}>{brokerContact} | {brokerPhone}</p>
          </div>
          <div style={{textAlign:"right"}}>
            <span style={{background:PSP.limeTint,border:`1px solid ${PSP.lime}`,color:PSP.dark,fontSize:11,fontFamily:"Outfit,sans-serif",fontWeight:700,padding:"4px 12px",borderRadius:999}}>Novated Lease Quote</span>
            <p style={{fontSize:12,color:PSP.textMuted,marginTop:6,fontFamily:"Lato,sans-serif"}}>{new Date().toLocaleDateString("en-AU",{day:"numeric",month:"long",year:"numeric"})}</p>
          </div>
        </div>
        <p style={{fontSize:15,fontFamily:"Outfit,sans-serif",fontWeight:700,color:PSP.blue,marginBottom:2}}>Prepared for: <span style={{color:PSP.dark}}>{empName||"Employee"}</span></p>
        {employer&&<p style={{fontSize:13,color:PSP.textMuted,marginBottom:4,fontFamily:"Lato,sans-serif"}}>{employer}{empState?" — "+empState:""}</p>}
        <div style={{height:1,background:PSP.border,margin:"14px 0"}}/>
        <Grid>
          {[["Make",vehicleMake||"—"],["Model",vehicleModel||"—"],["Variant",vehicleVariant||"—"],["Car class",carClass+" - "+(isEV?"EV / FBT Exempt":"ECM")],["Gross annual salary",fmt(annualSalary)],["Pay cycle",cycleLabel],["Lease term",leaseTerm+" year"+(leaseTerm>1?"s":"")],["Annual km",annualKm.toLocaleString()+" km"],["Driveaway cost",fmt(driveaway)],["Application fee",fmt(applicationFee)],["ATO residual ex GST ("+fmtPct(c.residualPct)+")",fmt(c.residualExGST)]].map(([k,v])=>(
            <div key={k} style={{borderBottom:`1px solid ${PSP.border}`,paddingBottom:10}}>
              <p style={{fontSize:10,fontFamily:"Outfit,sans-serif",fontWeight:700,color:PSP.textMuted,marginBottom:3,textTransform:"uppercase",letterSpacing:"0.06em"}}>{k}</p>
              <p style={{fontSize:14,fontFamily:"Outfit,sans-serif",fontWeight:700,color:PSP.blue,margin:0}}>{v}</p>
            </div>
          ))}
        </Grid>
        <div style={{height:1,background:PSP.border,margin:"18px 0"}}/>
        <p style={{fontFamily:"Outfit,sans-serif",fontWeight:700,fontSize:15,color:PSP.blue,marginBottom:14}}>Net wage impact — {cycleLabel.toLowerCase()} comparison</p>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:16}}>
          <div style={{background:PSP.pageTint,border:`1px solid ${PSP.border}`,borderRadius:16,padding:"16px 18px"}}>
            <p style={{fontSize:10,fontFamily:"Outfit,sans-serif",fontWeight:700,color:PSP.textMuted,marginBottom:6,textTransform:"uppercase",letterSpacing:"0.06em"}}>Cash purchase cost {cycBadge}</p>
            <p style={{fontSize:22,fontFamily:"Outfit,sans-serif",fontWeight:900,color:PSP.blue,margin:0}}>{fmt(cashCost)}</p>
          </div>
          <div style={{background:PSP.blue100,border:`1.5px solid ${PSP.blue}`,borderRadius:16,padding:"16px 18px"}}>
            <p style={{fontSize:10,fontFamily:"Outfit,sans-serif",fontWeight:700,color:PSP.textMuted,marginBottom:6,textTransform:"uppercase",letterSpacing:"0.06em"}}>Income tax saving {cycBadge}</p>
            <p style={{fontSize:22,fontFamily:"Outfit,sans-serif",fontWeight:900,color:PSP.blue,margin:0}}>{fmt(taxSavingPC)}</p>
          </div>
          <div style={{background:PSP.page,borderRadius:16,padding:"16px 18px",boxShadow:PSP.shadowMd}}>
            <p style={{fontSize:10,fontFamily:"Outfit,sans-serif",fontWeight:700,color:PSP.textOnDarkM,marginBottom:6,textTransform:"uppercase",letterSpacing:"0.06em"}}>Impact to wage {cycBadge}</p>
            <p style={{fontSize:22,fontFamily:"Outfit,sans-serif",fontWeight:900,color:PSP.lime,margin:0}}>{fmt(wageImpact)}</p>
          </div>
        </div>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,marginBottom:16,fontFamily:"Lato,sans-serif"}}>
          <thead>
            <tr style={{background:PSP.page}}>
              <th style={{padding:"9px 10px",textAlign:"left",color:PSP.textOnDarkM,fontFamily:"Outfit,sans-serif",fontWeight:700,fontSize:11,textTransform:"uppercase",letterSpacing:"0.06em"}}>Item</th>
              <th style={{padding:"9px 10px",textAlign:"right",color:PSP.textOnDarkM,fontFamily:"Outfit,sans-serif",fontWeight:700,fontSize:11,textTransform:"uppercase",letterSpacing:"0.06em"}}>Cash purchase</th>
              <th style={{padding:"9px 10px",textAlign:"right",color:PSP.lime,fontFamily:"Outfit,sans-serif",fontWeight:700,fontSize:11,textTransform:"uppercase",letterSpacing:"0.06em"}}>{method} novated</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["Gross salary",c.pcSalary,c.pcSalary],
              ["Pre-tax salary sacrifice",0,isEV?c.pcSsEV:c.pcSsECM],
              ["Income tax + Medicare",c.pcTaxGross,isEV?c.pcTaxEV:c.pcTaxECM],
              ["Post-tax vehicle cost",c.pcAnnualTotal,isEV?0:c.pcEcm],
              ["Net wage impact "+cycBadge,c.pcSalary-c.pcTaxGross-c.pcAnnualTotal,c.pcSalary-(isEV?c.pcTaxEV:c.pcTaxECM)-c.pcAnnualTotal],
            ].map(([label,cash,novated],i)=>{
              const isNet=label.startsWith("Net wage");
              return <tr key={i} style={{borderBottom:`1px solid ${PSP.border}`,background:isNet?PSP.limeTint:"transparent"}}>
                <td style={{padding:"9px 10px",fontFamily:isNet?"Outfit,sans-serif":"Lato,sans-serif",fontWeight:isNet?700:400,color:isNet?PSP.dark:PSP.text}}>{label}</td>
                <td style={{padding:"9px 10px",textAlign:"right",fontFamily:"Outfit,sans-serif",fontWeight:isNet?700:400,color:isNet?PSP.dark:PSP.textMuted}}>{fmt(cash)}</td>
                <td style={{padding:"9px 10px",textAlign:"right",fontFamily:"Outfit,sans-serif",fontWeight:isNet?800:700,color:isNet?PSP.dark:PSP.blue}}>{fmt(novated)}</td>
              </tr>;
            })}
          </tbody>
        </table>
        <div style={{height:1,background:PSP.border,margin:"0 0 18px"}}/>
        <p style={{fontFamily:"Outfit,sans-serif",fontWeight:700,fontSize:14,color:PSP.blue,marginBottom:12}}>{method} method — {cycleLabel.toLowerCase()} summary</p>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,marginBottom:18,fontFamily:"Lato,sans-serif"}}>
          <tbody>
            {[
              [cycleLabel+" lease repayment",fmt(c.pcMFin)],
              [cycleLabel+" running costs",fmt(c.pcMonthlyRunning)],
              [cycleLabel+" management fee",fmt(c.pcMgmtFee)],
              ...(!isEV?[[cycleLabel+" post-tax contribution",fmt(c.pcEcm)]]:[]),
              [cycleLabel+" income tax saving",fmt(isEV?c.pcTaxSavingEV:c.pcTaxSavingECM)],
              [cycleLabel+" net take-home",fmt(isEV?c.pcNetEV:c.pcNetECM)],
              ["Annual tax saving",fmt(isEV?c.taxSavingEV:c.taxSavingECM)],
              [leaseTerm+"-year total tax saving",fmt(isEV?c.taxSavingEV*leaseTerm:c.taxSavingECM*leaseTerm)],
              ["GST saving (one-off)",fmt(gstSaving)],
              ["Total benefit over "+leaseTerm+" years",fmt(totalBenefit)],
            ].map(([k,v],i)=>{
              const hi=k.includes("saving")||k.includes("benefit");
              return <tr key={i} style={{borderBottom:`1px solid ${PSP.border}`,background:hi?PSP.limeTint:"transparent"}}>
                <td style={{padding:"9px 0",fontFamily:hi?"Outfit,sans-serif":"Lato,sans-serif",fontWeight:hi?700:400,color:hi?PSP.dark:PSP.text}}>{k}</td>
                <td style={{padding:"9px 0",textAlign:"right",fontFamily:"Outfit,sans-serif",fontWeight:hi?800:700,color:hi?PSP.dark:PSP.blue,fontSize:hi?15:13}}>{v}</td>
              </tr>;
            })}
          </tbody>
        </table>
        <div style={{height:1,background:PSP.border,margin:"0 0 18px"}}/>
        <p style={{fontFamily:"Outfit,sans-serif",fontWeight:700,fontSize:14,color:PSP.blue,marginBottom:12}}>{cycleLabel} running costs</p>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,marginBottom:18,fontFamily:"Lato,sans-serif"}}>
          <tbody>
            {runningItems.map(({key,annualVal})=>(
              <tr key={key} style={{borderBottom:`1px solid ${PSP.border}`}}>
                <td style={{padding:"8px 0",color:PSP.text}}>{key==="fuel"?(isEV?"Charging":"Fuel"):key==="rego"?"Registration":key==="insurance"?"Insurance":key==="service"?"Service / maintenance":"Tyres"}</td>
                <td style={{padding:"8px 0",textAlign:"right",fontFamily:"Outfit,sans-serif",fontWeight:700,color:PSP.blue}}>{fmt(annualVal/cycleDiv)}/{cycleLabel.toLowerCase()}</td>
                <td style={{padding:"8px 0",textAlign:"right",color:PSP.textMuted}}>{fmt(annualVal)}/yr</td>
              </tr>
            ))}
            <tr style={{background:PSP.limeTint}}>
              <td style={{padding:"8px 0",fontFamily:"Outfit,sans-serif",fontWeight:700,color:PSP.dark}}>Total running</td>
              <td style={{padding:"8px 0",textAlign:"right",fontFamily:"Outfit,sans-serif",fontWeight:800,color:PSP.dark}}>{fmt(annualRunning/cycleDiv)}/{cycleLabel.toLowerCase()}</td>
              <td style={{padding:"8px 0",textAlign:"right",fontFamily:"Outfit,sans-serif",fontWeight:700,color:PSP.dark}}>{fmt(annualRunning)}/yr</td>
            </tr>
          </tbody>
        </table>
        <div style={{background:PSP.page,borderRadius:16,padding:"18px 22px",marginBottom:16}}>
          <p style={{fontSize:11,fontFamily:"Outfit,sans-serif",fontWeight:700,color:PSP.textOnDarkM,marginBottom:4,textTransform:"uppercase",letterSpacing:"0.08em"}}>Estimated {leaseTerm}-year total benefit (tax saving + GST)</p>
          <p style={{fontSize:32,fontFamily:"Outfit,sans-serif",fontWeight:900,color:PSP.lime,margin:0}}>{fmt(totalBenefit)}</p>
        </div>
        <div style={{borderTop:`1px solid ${PSP.border}`,paddingTop:14}}>
          <p style={{fontSize:10,fontFamily:"Outfit,sans-serif",fontWeight:700,color:PSP.textMuted,marginBottom:6,textTransform:"uppercase",letterSpacing:"0.06em"}}>Disclaimer</p>
          <p style={{fontSize:11,color:PSP.textMuted,lineHeight:1.8,fontFamily:"Lato,sans-serif"}}>Vehicle supply is subject to availability and pricing may change subject to manufacturer discretion and could affect the estimated figures listed above. Novated leasing or Vehicle Packaging works for the employee by substituting a taxable benefit compared to their current personal scenario. The above figures represent the estimated net impact on your income taking into account the assumed tax and GST savings. All applications are subject to normal credit criteria and assessment along with loan/lease suitability. Terms, conditions, fees and charges may apply. It is best to seek financial advice from an independent specialist such as an accountant in regards to your own personal circumstances before solely relying on these figures.</p>
        </div>
      </Card>
      <div style={{display:"flex",gap:10,marginTop:20,justifyContent:"flex-end"}}>
        <button onClick={saveQuote} style={{padding:"14px 24px",fontSize:15,fontWeight:700,fontFamily:"Outfit,sans-serif",background:PSP.blue,color:"#fff",border:"none",borderRadius:14,boxShadow:PSP.shadowSm}}>{editingQuoteId?"Update saved quote":"Save to repository"}</button>
        <button onClick={generatePDF} style={{padding:"14px 24px",fontSize:15,fontWeight:700,fontFamily:"Outfit,sans-serif",background:PSP.lime,color:PSP.dark,border:"none",borderRadius:14,boxShadow:PSP.shadowSm}}>Export PDF</button>
      </div>
    </div>;
  }

  function renderRepository(){
    return <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10}}>
        <div>
          <p style={{fontFamily:"Outfit,sans-serif",fontWeight:700,fontSize:16,color:PSP.blue,margin:0}}>Quote repository</p>
          <p style={{fontSize:13,color:PSP.textMuted,fontFamily:"Lato,sans-serif",marginTop:2}}>{savedQuotes.length} quote{savedQuotes.length!==1?"s":""} saved</p>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={newQuote} style={{background:PSP.lime,color:PSP.dark,border:"none",borderRadius:14,padding:"9px 18px",fontSize:13,fontFamily:"Outfit,sans-serif",fontWeight:700}}>+ New quote</button>
          <button onClick={saveQuote} style={{background:PSP.blue,color:"#fff",border:"none",borderRadius:14,padding:"9px 18px",fontSize:13,fontFamily:"Outfit,sans-serif",fontWeight:700}}>{editingQuoteId?"Update current":"Save current"}</button>
        </div>
      </div>
      {editingQuoteId&&<div style={{background:PSP.limeTint,border:`1.5px solid ${PSP.lime}`,borderRadius:12,padding:"10px 16px",marginBottom:16,fontSize:13,fontFamily:"Outfit,sans-serif",fontWeight:700,color:PSP.dark}}>Editing: {savedQuotes.find(q=>q.id===editingQuoteId)?.empName||"Unnamed"}</div>}
      {savedQuotes.length===0?(
        <Card>
          <div style={{textAlign:"center",padding:"48px 20px"}}>
            <div style={{width:56,height:56,borderRadius:"50%",background:PSP.limeTint,border:`1.5px solid ${PSP.lime}`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px",fontSize:24}}>📁</div>
            <p style={{fontFamily:"Outfit,sans-serif",fontWeight:700,fontSize:16,color:PSP.blue,marginBottom:8}}>No quotes saved yet</p>
            <p style={{fontSize:13,color:PSP.textMuted,marginBottom:20,fontFamily:"Lato,sans-serif"}}>Fill in the Inputs tab and save from the Quote tab.</p>
            <button onClick={()=>setTab(0)} style={{background:PSP.blue,color:"#fff",border:"none",borderRadius:14,padding:"11px 22px",fontSize:13,fontFamily:"Outfit,sans-serif",fontWeight:700}}>Go to inputs</button>
          </div>
        </Card>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {savedQuotes.slice().reverse().map(q=>{
            const isActive=q.id===editingQuoteId;
            const d=new Date(q.savedAt);
            const vName=[q.vehicleMake,q.vehicleModel,q.vehicleVariant].filter(Boolean).join(" ")||q.carClass;
            return <div key={q.id} style={{background:isActive?PSP.limeTint:PSP.card,border:`1.5px solid ${isActive?PSP.lime:PSP.border}`,borderRadius:20,padding:"18px 20px",boxShadow:PSP.shadowMd}}>
              <div style={{display:"flex",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                    <p style={{fontFamily:"Outfit,sans-serif",fontWeight:700,fontSize:15,color:PSP.blue,margin:0}}>{q.empName||"Unnamed employee"}</p>
                    {isActive&&<span style={{background:PSP.lime,color:PSP.dark,fontSize:10,fontFamily:"Outfit,sans-serif",fontWeight:700,padding:"2px 8px",borderRadius:999}}>Active</span>}
                  </div>
                  <p style={{fontSize:13,color:PSP.textMuted,marginBottom:10,fontFamily:"Lato,sans-serif"}}>{q.employer||"No employer"}{q.empState?" — "+q.empState:""} | {vName} | {q.fbtMethod}</p>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:8}}>
                    {[["Driveaway",fmt(q.driveaway)],["Salary",fmt(q.annualSalary)],["Term",q.leaseTerm+" yr"],["Total benefit",fmt(q.totalBenefit)],["Tax saving",fmt(q.mainSaving)],["GST saving",fmt((q.gstSaving||0)+(q.gstOnPkg||0))]].map(([lbl,val])=>(
                      <div key={lbl} style={{background:PSP.pageTint,borderRadius:10,padding:"8px 12px"}}>
                        <p style={{fontSize:10,fontFamily:"Outfit,sans-serif",fontWeight:700,color:PSP.textMuted,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:3}}>{lbl}</p>
                        <p style={{fontSize:13,fontFamily:"Outfit,sans-serif",fontWeight:700,color:PSP.blue,margin:0}}>{val}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{textAlign:"right",minWidth:100}}>
                  <p style={{fontSize:11,color:PSP.textMuted,marginBottom:12,fontFamily:"Lato,sans-serif"}}>{d.toLocaleDateString("en-AU",{day:"numeric",month:"short",year:"numeric"})}<br/>{d.toLocaleTimeString("en-AU",{hour:"2-digit",minute:"2-digit"})}</p>
                  <div style={{display:"flex",flexDirection:"column",gap:6}}>
                    <button onClick={()=>loadQuote(q)} style={{background:PSP.blue,color:"#fff",border:"none",borderRadius:10,padding:"7px 16px",fontSize:12,fontFamily:"Outfit,sans-serif",fontWeight:700}}>Load</button>
                    <button onClick={()=>{loadQuote(q);setTimeout(()=>setTab(4),50);}} style={{background:PSP.limeTint,color:PSP.dark,border:`1px solid ${PSP.lime}`,borderRadius:10,padding:"7px 16px",fontSize:12,fontFamily:"Outfit,sans-serif",fontWeight:700}}>View quote</button>
                    <button onClick={()=>deleteQuote(q.id)} style={{background:"rgba(211,58,44,0.10)",color:"#D33A2C",border:"none",borderRadius:10,padding:"7px 16px",fontSize:12,fontFamily:"Outfit,sans-serif",fontWeight:700}}>Delete</button>
                  </div>
                </div>
              </div>
            </div>;
          })}
        </div>
      )}
      <div style={{marginTop:16,padding:"12px 16px",background:"rgba(255,255,250,0.04)",borderRadius:12,border:`1px solid rgba(255,255,255,0.07)`}}>
        <p style={{fontSize:12,color:PSP.textOnDarkM,fontFamily:"Lato,sans-serif",margin:0}}>Quotes are stored in this browser session. Export PDF before closing to preserve them.</p>
      </div>
    </div>;
  }

  const panels=[renderInputs,renderResults,renderSalary,renderSavings,renderQuote,renderRepository];

  return <div>
    <style>{`
      ${GFONTS}
      *{box-sizing:border-box;margin:0;padding:0;}
      body{font-family:'Lato',sans-serif;background:${PSP.page};}
      input,select{background:${PSP.card};border:1.5px solid ${PSP.border};border-radius:10px;padding:10px 13px;font-size:14px;font-family:'Lato',sans-serif;width:100%;color:${PSP.text};outline:none;transition:border-color 140ms,box-shadow 140ms;}
      input:focus,select:focus{border-color:${PSP.blue};box-shadow:0 0 0 3px rgba(10,80,211,0.18);}
      button{cursor:pointer;font-family:'Outfit',sans-serif;}
    `}</style>
    <div style={{background:PSP.page,borderBottom:`1px solid rgba(255,255,255,0.07)`,padding:"0 24px"}}>
      <div style={{maxWidth:900,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",height:64}}>
        <PSPLogo height={36}/>
        <button onClick={generatePDF} style={{background:PSP.lime,color:PSP.dark,border:"none",borderRadius:14,padding:"9px 18px",fontSize:13,fontFamily:"Outfit,sans-serif",fontWeight:700,boxShadow:PSP.shadowSm,flexShrink:0}}>Export PDF</button>
      </div>
    </div>
    <div style={{background:PSP.page,padding:"40px 24px 32px"}}>
      <div style={{maxWidth:900,margin:"0 auto"}}>
        <div style={{display:"inline-flex",alignItems:"center",gap:8,background:PSP.limeTint,border:`1px solid rgba(161,226,32,0.35)`,borderRadius:999,padding:"4px 14px",marginBottom:16}}>
          <span style={{width:8,height:8,borderRadius:"50%",background:PSP.lime,display:"inline-block"}}/>
          <span style={{fontSize:11,fontFamily:"Outfit,sans-serif",fontWeight:700,color:PSP.lime,letterSpacing:"0.08em",textTransform:"uppercase"}}>Novated lease calculator</span>
        </div>
        <h1 style={{fontFamily:"Outfit,sans-serif",fontWeight:900,fontSize:36,color:PSP.textOnDark,margin:"0 0 8px",lineHeight:1.15}}>Get your next car, <span style={{color:PSP.lime}}>better off.</span></h1>
        <p style={{fontSize:15,color:PSP.textOnDarkM,fontFamily:"Lato,sans-serif",maxWidth:520,lineHeight:1.6,margin:0}}>Calculate your tax savings, FBT, and salary impact across ECM and EV methods.</p>
      </div>
    </div>
    <div style={{background:PSP.dark,position:"sticky",top:0,zIndex:10,boxShadow:"0 4px 12px rgba(11,16,18,0.3)"}}>
      <div style={{maxWidth:900,margin:"0 auto",display:"flex",overflowX:"auto"}}>
        {TABS.map((t,i)=><button key={t} onClick={()=>setTab(i)} style={{padding:"14px 20px",fontSize:13,fontWeight:700,fontFamily:"Outfit,sans-serif",border:"none",background:"transparent",color:tab===i?PSP.lime:PSP.textOnDarkM,borderBottom:tab===i?`2px solid ${PSP.lime}`:"2px solid transparent",whiteSpace:"nowrap",transition:"color 140ms",letterSpacing:"0.01em"}}>{t}</button>)}
      </div>
    </div>
    <div style={{maxWidth:900,margin:"0 auto",padding:"24px 16px 48px"}}>{panels[tab]()}</div>
    <div style={{background:PSP.page,borderTop:`1px solid rgba(255,255,255,0.07)`,padding:"40px 24px",textAlign:"center"}}>
      <PSPLogo height={28}/>
      <p style={{fontSize:12,color:PSP.textOnDarkM,marginTop:16,fontFamily:"Lato,sans-serif",lineHeight:1.6,maxWidth:520,margin:"16px auto 0"}}>Powered by Positive — novated lease calculator for accredited brokers. Generate compliant, customer-ready quotes in minutes.</p>
    </div>
    {showBudgetWarning&&<div style={{position:"fixed",top:0,left:0,width:"100%",height:"100%",background:"rgba(11,16,18,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000}}>
      <div style={{background:PSP.card,borderRadius:24,padding:"32px",maxWidth:400,width:"90%",boxShadow:PSP.shadowLg}}>
        <div style={{width:44,height:44,borderRadius:"50%",background:PSP.limeTint,border:`1.5px solid ${PSP.lime}`,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:16,fontSize:20}}>⚠</div>
        <p style={{fontFamily:"Outfit,sans-serif",fontWeight:700,fontSize:16,color:PSP.blue,marginBottom:10}}>Budget change notice</p>
        <p style={{fontSize:14,color:PSP.text,lineHeight:1.7,marginBottom:24,fontFamily:"Lato,sans-serif"}}>Changing budgets may impact the driver's ability to make claims during inlife management.</p>
        <button onClick={()=>setShowBudgetWarning(false)} style={{width:"100%",padding:"12px",fontSize:14,fontWeight:700,fontFamily:"Outfit,sans-serif",background:PSP.blue,color:"#fff",border:"none",borderRadius:14}}>I understand</button>
      </div>
    </div>}
  </div>;
}
