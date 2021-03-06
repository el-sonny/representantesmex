/**
 * Sesion
 *
 * @module      :: Model
 * @description :: A short summary of how this model works and what it represents.
 * @docs		:: http://sailsjs.org/#!documentation/models
 */

module.exports = {
  attributes: {    
	periodo:{
		model:'periodo',
		dominant: true,
	},
	asistencias:{
        collection: 'asistencia',
        via: 'sesion',
        dominant: true,
    },
  }
};
