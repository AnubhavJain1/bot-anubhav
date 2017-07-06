// This loads the environment variables from the .env file
//require('dotenv-extended').load();

"use strict";
var util = require('util');
var _ = require('lodash');
var builder = require("botbuilder");
var botbuilder_azure = require("botbuilder-azure");
var path = require('path');

/// <reference path="../SearchDialogLibrary/index.d.ts" />
var SearchLibrary = require('./SearchDialogLibrary');
var AzureSearch = require('./SearchProviders/azure-search');

var useEmulator = (process.env.NODE_ENV == 'development');

var connector = useEmulator ? new builder.ChatConnector() : new botbuilder_azure.BotServiceConnector({
    appId: process.env['MicrosoftAppId'],
    appPassword: process.env['MicrosoftAppPassword'],
    stateEndpoint: process.env['BotStateEndpoint'],
    openIdMetadata: process.env['BotOpenIdMetadata']
});

// Bot with main dialog that triggers search and display its results
var bot = new builder.UniversalBot(connector, [
    function (session) {
        // Trigger Search
        SearchLibrary.begin(session);
    },
    function (session, args) {
        // Process selected search results
        session.send(
            'Done! For future reference, you selected these properties: %s',
            args.selection.map(function (i) { return i.key; }).join(', '));
    }
]);

// Azure Search
var azureSearchClient = AzureSearch.create('unscrambl', '0677FE05B85ECFB51CF2005562553CC4', 'poi-index');
var unscramblResultsMapper = SearchLibrary.defaultResultsMapper(unscramblToSearchHit);

// Register Search Dialogs Library with bot
bot.library(SearchLibrary.create({
    multipleSelection: true,
    search: function (query) { return azureSearchClient.search(query).then(unscramblResultsMapper); },
    refiners: ['Category', 'ProductType', 'Streetname', 'Streettype', 'State', 'District', 'City', 'Neighborhood', 'Country', 'geohash', 'neighboring_gh'],
    refineFormatter: function (refiners) {
        return _.zipObject(
            refiners.map(function (r) { return 'By ' + _.capitalize(r); }),
            refiners);
    }
}));

// Maps the AzureSearch RealState Document into a SearchHit that the Search Library can use
function unscramblToSearchHit(unscrambl) {
    return {
        key: unscrambl.id,
        title: util.format('%s, Location : %s, (%s,%s)',
            unscrambl.Name, unscrambl.geohash, unscrambl.Latitude, unscrambl.Longitude),
        description: util.format('(%s, %s, near %s, %s, %s, %s)',
            unscrambl.Streetname, unscrambl.City, unscrambl.Neighborhood, unscrambl.District, unscrambl.State, unscrambl.Country)
//        imageUrl: unscrambl.thumbnail
    };
}

bot.dialog('help', (session, args, next) => {
    // Send message to the user and end this dialog
    session.send("! Help !");
    session.endDialog('This is an Azure Search bot that finds POIs near the location you enter. Here are the Searchable fields: Streetname, City, District, State, Country, Neighborhood, geohash and neighboring geohashes. Your query must contain value representing any of the field. For example, type "Manila" and see the results.');
}).triggerAction({
    matches: /^help|support|assist/i,
    //onSelectAction: (session, args) => {
        // Add the help dialog to the dialog stack 
        // (override the default behavior of replacing the stack)
    //    session.beginDialog(args.action, args);
    //}
});

if (useEmulator) {
    var restify = require('restify');
    var server = restify.createServer();
    server.listen(3978, function() {
        console.log('test bot endpont at http://localhost:3978/api/messages');
    });
    server.post('/api/messages', connector.listen());    
} else {
    module.exports = { default: connector.listen() }
}
