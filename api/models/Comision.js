/**
 * Comision.js
 *
 * @description :: TODO: You might write a short summary of how this model works and what it represents here.
 * @docs		:: http://sailsjs.org/#!documentation/models
 */

module.exports = {

	attributes: {
		diputados:{
			collection: 'diputado',
			via: 'comisiones',
			dominant : true
		},
		tipo:{
            model:'tipo_de_comision',
            dominant: true,
        }
	},


};
