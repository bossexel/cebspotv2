const {test}=require('node:test');const assert=require('node:assert/strict');
const {getReservationContact:contact}=require('./load-client.cjs')('src/utils/reservationContact.ts');
const profile={first_name:'  Synthetic',last_name:'Guest  ',display_name:'Ignored display name',email:' GUEST@EXAMPLE.TEST '};
test('booking contact snapshot normalizes profile identity and server-supported phone formatting',()=>{
 const c=contact(profile,'+63 (917) 123-4567');assert.equal(c.guest_name,'Synthetic Guest');assert.equal(c.guest_email,'guest@example.test');assert.equal(c.guest_phone,'+639171234567');
 assert.equal(contact({...profile,first_name:null,last_name:null,display_name:' Test Guest '},'09171234567').guest_name,'Test Guest');
});
test('missing identity, malformed email, and invalid Philippine phone numbers cannot enable confirmation',()=>{
 for(const p of [null,{...profile,first_name:null,last_name:null,display_name:null},{...profile,email:null},{...profile,email:'a@'},{...profile,email:'a@bad host.test'},{...profile,email:'a@@example.test'},{...profile,first_name:'x'.repeat(121)}])assert.equal(contact(p,'09171234567'),null);
 for(const number of ['', '123', '09171234567<script>', '0917abc1234567', '+12345678901', '091712345678'])assert.equal(contact(profile,number),null);
});
